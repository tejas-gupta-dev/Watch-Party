import type { Server, Socket } from 'socket.io';
import { ZodError, type ZodType } from 'zod';
import { ClientEvents, ServerEvents } from '@watch-party/shared';
import { AppError } from '../../middleware/errorHandler';
import { eventErrors, eventLatency, eventsTotal, clientDrift } from '../../infra/metrics';
import { logger } from '../../infra/logger';
import type { AuthUser } from '../auth/auth.service';
import type { Room } from '../rooms/Room';
import type { RoomRegistry } from './RoomRegistry';
import { schemas } from './schemas';
import { handleJoin, handleLeave, handleDisconnect } from './handlers/joinLeave';
import { handlePlay, handlePause, handleSeek, handleChangeVideo } from './handlers/playback';
import { handleAssignRole, handleRemove, handleTransferHost } from './handlers/roles';
import { handleRequestAction, handleApprove, handleReject } from './handlers/approvals';
import { handleChat, handleReaction } from './handlers/chat';

/** Everything a handler needs. Built once per socket. */
export interface Ctx {
  io: Server;
  registry: RoomRegistry;
  socket: Socket;
  user: AuthUser;
  /** The room this socket has joined; throws if it has not joined one. */
  requireRoom(): Promise<Room>;
}

export type Ack = ((r: unknown) => void) | undefined;
export type Handler<P> = (ctx: Ctx, payload: P, ack: Ack) => Promise<void> | void;

const MAX_EVENTS_PER_SECOND = 50;

/**
 * Routes each socket event to its handler: validates the payload, rate-limits,
 * records metrics and converts thrown errors into a `room:notice` for the sender.
 */
export class MessageHandler {
  private readonly ctx: Ctx;
  private windowStart = Date.now();
  private count = 0;

  constructor(io: Server, registry: RoomRegistry, private readonly socket: Socket) {
    const user = socket.data.user as AuthUser;
    this.ctx = {
      io, registry, socket, user,
      requireRoom: async () => {
        const code = socket.data.roomCode as string | undefined;
        const room = code ? await registry.get(code) : null;
        if (!room || !room.has(user.id)) throw new AppError('Join a room first', 400);
        return room;
      },
    };
  }

  register(): void {
    const E = ClientEvents;
    this.bind(E.Join, schemas.join, handleJoin);
    this.bind(E.Leave, schemas.any, (c) => handleLeave(c));
    this.bind(E.Play, schemas.position, handlePlay);
    this.bind(E.Pause, schemas.position, handlePause);
    this.bind(E.Seek, schemas.position, handleSeek);
    this.bind(E.ChangeVideo, schemas.changeVideo, handleChangeVideo);
    this.bind(E.AssignRole, schemas.assignRole, handleAssignRole);
    this.bind(E.RemoveParticipant, schemas.target, handleRemove);
    this.bind(E.TransferHost, schemas.target, handleTransferHost);
    this.bind(E.RequestAction, schemas.requestAction, handleRequestAction);
    this.bind(E.Approve, schemas.requestId, handleApprove);
    this.bind(E.Reject, schemas.requestId, handleReject);
    this.bind(E.Chat, schemas.chat, handleChat);
    this.bind(E.Reaction, schemas.reaction, handleReaction);
    this.bind(E.ClockPing, schemas.any, (_c, _p, ack) => ack?.(Date.now()));
    this.bind(E.ReportDrift, schemas.drift, (_c, p) => clientDrift.observe(Math.abs(p.driftMs)));
    this.socket.on('disconnect', () => void handleDisconnect(this.ctx));
  }

  private allow(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.count = 0; }
    return ++this.count <= MAX_EVENTS_PER_SECOND;
  }

  private bind<P>(event: string, schema: ZodType<P>, handler: Handler<P>): void {
    // clock:ping passes the ack as the FIRST argument (no payload); normalise both shapes
    this.socket.on(event, async (...args: unknown[]) => {
      const ack = [...args].reverse().find((a) => typeof a === 'function') as Ack;
      const raw = typeof args[0] === 'function' ? undefined : args[0];
      const endTimer = eventLatency.startTimer({ event });
      eventsTotal.inc({ event });
      try {
        if (!this.allow()) throw new AppError('Slow down', 429);
        const payload = schema.parse(raw ?? {});
        await handler(this.ctx, payload, ack);
      } catch (err) {
        eventErrors.inc({ event });
        const message =
          err instanceof AppError ? err.message : err instanceof ZodError ? 'Invalid request' : 'Something went wrong';
        if (!(err instanceof AppError) && !(err instanceof ZodError)) logger.error({ err, event }, 'handler failed');
        ack?.({ ok: false, error: message });
        this.socket.emit(ServerEvents.Notice, { level: 'error', message });
      } finally {
        endTimer();
      }
    });
  }
}

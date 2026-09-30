import { type Ack as AckResult, type RoomSnapshot, ServerEvents } from '@watch-party/shared';
import { AppError } from '../../../middleware/errorHandler';
import type { Ctx, Handler } from '../MessageHandler';

export const handleJoin: Handler<{ code: string }> = async (ctx, { code }, ack) => {
  const { socket, user, registry } = ctx;
  const room = await registry.get(code);
  if (!room) throw new AppError('No room with that code', 404);

  // leaving a previous room on this socket first
  if (socket.data.roomCode && socket.data.roomCode !== room.code) await handleLeave(ctx);

  // same account in a second tab: eject the older socket so state stays single-source
  const existing = room.getParticipant(user.id);
  if (existing?.socketId && existing.socketId !== socket.id) {
    ctx.io.to(existing.socketId).emit(ServerEvents.Kicked);
    ctx.io.in(existing.socketId).socketsLeave(room.code);
  }

  room.join(user, socket.id);
  socket.data.roomCode = room.code;
  await socket.join(room.code);

  const chat = await registry.chatHistory(room.code);
  const result: AckResult<RoomSnapshot> = { ok: true, data: room.snapshot(user.id, chat) };
  ack?.(result);

  room.broadcastParticipants();
  room.broadcastApprovals();
  await registry.persist(room);
};

export async function handleLeave(ctx: Ctx): Promise<void> {
  const { socket, user, registry } = ctx;
  const code = socket.data.roomCode as string | undefined;
  if (!code) return;
  socket.data.roomCode = undefined;
  await socket.leave(code);
  const room = await registry.get(code);
  if (!room) return;
  room.leave(user.id);
  room.broadcastParticipants();
  room.broadcastApprovals();
  registry.scheduleEvict(room);
}

export async function handleDisconnect(ctx: Ctx): Promise<void> {
  const { socket, user, registry } = ctx;
  const code = socket.data.roomCode as string | undefined;
  if (!code) return;
  const room = await registry.get(code);
  if (!room) return;
  room.disconnect(user.id, socket.id, () => {
    room.broadcastParticipants();
    room.broadcastApprovals();
    registry.scheduleEvict(room);
  });
  room.broadcastParticipants();
  registry.scheduleEvict(room);
}

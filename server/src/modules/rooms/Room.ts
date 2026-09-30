import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {
  Role, canPerform, ServerEvents,
  type ApprovalRequest, type ChatMessage, type ParticipantDTO, type PlaybackAction,
  type PlaybackState, type RoomSnapshot, type Source,
} from '@watch-party/shared';
import type { AuthUser } from '../auth/auth.service';
import { Participant } from './Participant';

const RECONNECT_GRACE_MS = 30_000;
const MAX_PENDING_APPROVALS = 20;
const ROLE_ORDER: Record<Role, number> = { [Role.Host]: 0, [Role.Moderator]: 1, [Role.Participant]: 2 };

export interface SerializedRoom {
  code: string;
  name: string;
  hostId: string;
  roles: [string, Role][];
  playback: PlaybackState;
}

/**
 * One watch party. Holds membership, roles, the authoritative playback state and the
 * approval queue. It never checks permissions itself: handlers do that (permissions.ts)
 * and then call these mutators.
 */
export class Room {
  private readonly participants = new Map<string, Participant>();
  /** userId -> role. Survives disconnects so a refresh keeps your role. */
  private readonly roles = new Map<string, Role>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly removalTimers = new Map<string, NodeJS.Timeout>();

  playback: PlaybackState = { source: null, playing: false, position: 0, updatedAt: Date.now(), version: 0 };

  constructor(
    readonly code: string,
    public name: string,
    public hostId: string,
    private readonly io: Server,
  ) {
    this.roles.set(hostId, Role.Host);
  }

  // ---- membership ----------------------------------------------------------
  roleOf(userId: string): Role | undefined {
    return this.participants.has(userId) ? this.roles.get(userId) : undefined;
  }

  has(userId: string): boolean {
    return this.participants.has(userId);
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  join(user: AuthUser, socketId: string): Participant {
    this.cancelRemoval(user.id);
    const role = this.roles.get(user.id) ?? (user.id === this.hostId ? Role.Host : Role.Participant);
    this.roles.set(user.id, role);
    let p = this.participants.get(user.id);
    if (p) {
      p.username = user.username;
      p.socketId = socketId;
      p.role = role;
    } else {
      p = new Participant(user.id, user.username, role, socketId);
      this.participants.set(user.id, p);
    }
    return p;
  }

  /** Mark offline; drop from the list after a grace period unless they reconnect. */
  disconnect(userId: string, socketId: string, onRemoved: () => void): void {
    const p = this.participants.get(userId);
    if (!p || p.socketId !== socketId) return; // a newer tab already took over
    p.socketId = null;
    this.cancelRemoval(userId);
    this.removalTimers.set(
      userId,
      setTimeout(() => {
        this.removalTimers.delete(userId);
        this.participants.delete(userId);
        this.dropApprovalsOf(userId);
        onRemoved();
      }, RECONNECT_GRACE_MS),
    );
  }

  leave(userId: string): void {
    this.cancelRemoval(userId);
    this.participants.delete(userId);
    this.dropApprovalsOf(userId);
  }

  /** Remove for good (kick): the role is forgotten too. Returns the socket to eject. */
  kick(userId: string): string | null {
    const socketId = this.participants.get(userId)?.socketId ?? null;
    this.leave(userId);
    this.roles.delete(userId);
    return socketId;
  }

  hasOnline(): boolean {
    return [...this.participants.values()].some((p) => p.online);
  }

  destroy(): void {
    for (const t of this.removalTimers.values()) clearTimeout(t);
    this.removalTimers.clear();
  }

  private cancelRemoval(userId: string) {
    const t = this.removalTimers.get(userId);
    if (t) clearTimeout(t);
    this.removalTimers.delete(userId);
  }

  // ---- roles ---------------------------------------------------------------
  setRole(userId: string, role: Role): void {
    this.roles.set(userId, role);
    const p = this.participants.get(userId);
    if (p) p.role = role;
  }

  transferHost(toUserId: string): void {
    const old = this.hostId;
    this.hostId = toUserId;
    this.setRole(toUserId, Role.Host);
    this.setRole(old, Role.Moderator);
  }

  // ---- playback ------------------------------------------------------------
  applyAction(action: PlaybackAction, now = Date.now()): PlaybackState {
    const p = this.playback;
    switch (action.type) {
      case 'play': p.playing = true; p.position = action.position; break;
      case 'pause': p.playing = false; p.position = action.position; break;
      case 'seek': p.position = action.position; break;
      case 'change_video': p.source = action.source as Source; p.position = 0; p.playing = false; break;
    }
    p.updatedAt = now;
    p.version += 1;
    return p;
  }

  // ---- approvals -----------------------------------------------------------
  /** One pending request per user: a new one replaces the old. */
  addApproval(user: { id: string; username: string }, action: PlaybackAction): ApprovalRequest {
    this.dropApprovalsOf(user.id);
    if (this.approvals.size >= MAX_PENDING_APPROVALS) {
      const oldest = [...this.approvals.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.approvals.delete(oldest.id);
    }
    const req: ApprovalRequest = { id: randomUUID(), userId: user.id, username: user.username, action, createdAt: Date.now() };
    this.approvals.set(req.id, req);
    return req;
  }

  takeApproval(id: string): ApprovalRequest | undefined {
    const req = this.approvals.get(id);
    this.approvals.delete(id);
    return req;
  }

  approvalList(): ApprovalRequest[] {
    return [...this.approvals.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  private dropApprovalsOf(userId: string) {
    for (const [id, r] of this.approvals) if (r.userId === userId) this.approvals.delete(id);
  }

  // ---- views + broadcasting -------------------------------------------------
  participantDTOs(): ParticipantDTO[] {
    return [...this.participants.values()]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.username.localeCompare(b.username))
      .map((p) => p.toDTO());
  }

  snapshot(forUserId: string, chat: ChatMessage[]): RoomSnapshot {
    const role = this.roleOf(forUserId) ?? Role.Participant;
    return {
      code: this.code,
      name: this.name,
      you: { id: forUserId, role },
      participants: this.participantDTOs(),
      playback: this.playback,
      approvals: canPerform(role, 'approve_request') ? this.approvalList() : [],
      chat,
      serverTime: Date.now(),
    };
  }

  broadcast(event: string, payload?: unknown): void {
    this.io.to(this.code).emit(event, payload);
  }

  emitTo(userId: string, event: string, payload?: unknown): void {
    const sid = this.participants.get(userId)?.socketId;
    if (sid) this.io.to(sid).emit(event, payload);
  }

  /** Approval queue goes only to members who may approve. */
  broadcastApprovals(): void {
    const list = this.approvalList();
    for (const p of this.participants.values()) {
      if (p.socketId && canPerform(p.role, 'approve_request')) this.io.to(p.socketId).emit(ServerEvents.Approvals, list);
    }
  }

  broadcastParticipants(): void {
    this.broadcast(ServerEvents.Participants, this.participantDTOs());
  }

  // ---- persistence ---------------------------------------------------------
  serialize(): SerializedRoom {
    return { code: this.code, name: this.name, hostId: this.hostId, roles: [...this.roles.entries()], playback: this.playback };
  }

  static hydrate(data: SerializedRoom, io: Server): Room {
    const room = new Room(data.code, data.name, data.hostId, io);
    for (const [id, role] of data.roles) room.roles.set(id, role);
    room.playback = data.playback;
    return room;
  }
}

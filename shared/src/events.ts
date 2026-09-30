import type { Role } from './roles';
import type { Source } from './source';

/** Event names. Both sides import these, so a rename is a compile error, not a runtime bug. */
export const ClientEvents = {
  Join: 'room:join',
  Leave: 'room:leave',
  Play: 'playback:play',
  Pause: 'playback:pause',
  Seek: 'playback:seek',
  ChangeVideo: 'playback:change_video',
  AssignRole: 'roles:assign',
  RemoveParticipant: 'roles:remove',
  TransferHost: 'roles:transfer_host',
  RequestAction: 'approval:request',
  Approve: 'approval:approve',
  Reject: 'approval:reject',
  Chat: 'chat:message',
  Reaction: 'chat:reaction',
  ClockPing: 'clock:ping',
  ReportDrift: 'metrics:drift',
} as const;

export const ServerEvents = {
  Participants: 'room:participants',
  Playback: 'playback:state',
  Approvals: 'approval:queue',
  Chat: 'chat:message',
  Reaction: 'chat:reaction',
  Kicked: 'room:kicked',
  Notice: 'room:notice',
  Draining: 'server:draining',
} as const;

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '👏'] as const;

// ---- Data shapes -----------------------------------------------------------
export interface PlaybackState {
  source: Source | null;
  playing: boolean;
  /** seconds into the video at server time `updatedAt` */
  position: number;
  /** server epoch ms when position was recorded */
  updatedAt: number;
  /** increments on every change; clients ignore stale updates */
  version: number;
}

export interface ParticipantDTO {
  id: string;
  username: string;
  role: Role;
  online: boolean;
}

export type PlaybackAction =
  | { type: 'play'; position: number }
  | { type: 'pause'; position: number }
  | { type: 'seek'; position: number }
  | { type: 'change_video'; source: Source };

export interface ApprovalRequest {
  id: string;
  userId: string;
  username: string;
  action: PlaybackAction;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  ts: number;
}

export interface ReactionEvent {
  userId: string;
  username: string;
  emoji: string;
  ts: number;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  you: { id: string; role: Role };
  participants: ParticipantDTO[];
  playback: PlaybackState;
  /** only populated for members who may approve */
  approvals: ApprovalRequest[];
  chat: ChatMessage[];
  serverTime: number;
}

export interface Notice {
  level: 'info' | 'error';
  message: string;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

// ---- Payloads --------------------------------------------------------------
export interface JoinPayload { code: string }
export interface PositionPayload { position: number }
export interface ChangeVideoPayload { source: Source }
export interface AssignRolePayload { targetId: string; role: Role }
export interface TargetPayload { targetId: string }
export interface RequestActionPayload { action: PlaybackAction }
export interface RequestIdPayload { requestId: string }
export interface ChatPayload { text: string }
export interface ReactionPayload { emoji: string }
export interface DriftPayload { driftMs: number }

// ---- Socket.IO typings -----------------------------------------------------
export interface ClientToServerEvents {
  [ClientEvents.Join]: (p: JoinPayload, ack: (r: Ack<RoomSnapshot>) => void) => void;
  [ClientEvents.Leave]: () => void;
  [ClientEvents.Play]: (p: PositionPayload) => void;
  [ClientEvents.Pause]: (p: PositionPayload) => void;
  [ClientEvents.Seek]: (p: PositionPayload) => void;
  [ClientEvents.ChangeVideo]: (p: ChangeVideoPayload) => void;
  [ClientEvents.AssignRole]: (p: AssignRolePayload) => void;
  [ClientEvents.RemoveParticipant]: (p: TargetPayload) => void;
  [ClientEvents.TransferHost]: (p: TargetPayload) => void;
  [ClientEvents.RequestAction]: (p: RequestActionPayload) => void;
  [ClientEvents.Approve]: (p: RequestIdPayload) => void;
  [ClientEvents.Reject]: (p: RequestIdPayload) => void;
  [ClientEvents.Chat]: (p: ChatPayload) => void;
  [ClientEvents.Reaction]: (p: ReactionPayload) => void;
  [ClientEvents.ClockPing]: (ack: (serverTime: number) => void) => void;
  [ClientEvents.ReportDrift]: (p: DriftPayload) => void;
}

export interface ServerToClientEvents {
  [ServerEvents.Participants]: (p: ParticipantDTO[]) => void;
  [ServerEvents.Playback]: (p: PlaybackState) => void;
  [ServerEvents.Approvals]: (p: ApprovalRequest[]) => void;
  [ServerEvents.Chat]: (p: ChatMessage) => void;
  [ServerEvents.Reaction]: (p: ReactionEvent) => void;
  [ServerEvents.Kicked]: () => void;
  [ServerEvents.Notice]: (p: Notice) => void;
  [ServerEvents.Draining]: () => void;
}

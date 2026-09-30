import { create } from 'zustand';
import type {
  ApprovalRequest, ChatMessage, Notice, ParticipantDTO, PlaybackState, ReactionEvent, Role, RoomSnapshot,
} from '@watch-party/shared';

export type RoomStatus = 'idle' | 'connecting' | 'joined' | 'error' | 'kicked';
type FloatingReaction = ReactionEvent & { id: string };
type Toast = Notice & { id: string };

const EMPTY_PLAYBACK: PlaybackState = { source: null, playing: false, position: 0, updatedAt: 0, version: 0 };

interface RoomState {
  status: RoomStatus;
  error?: string;
  connected: boolean;
  code: string;
  name: string;
  me: { id: string; role: Role } | null;
  participants: ParticipantDTO[];
  playback: PlaybackState;
  approvals: ApprovalRequest[];
  chat: ChatMessage[];
  reactions: FloatingReaction[];
  toasts: Toast[];
  /** the file this member picked for a 'local' source (never sent anywhere) */
  localFile: File | null;

  setStatus: (s: RoomStatus, error?: string) => void;
  setConnected: (c: boolean) => void;
  setSnapshot: (s: RoomSnapshot) => void;
  setParticipants: (p: ParticipantDTO[]) => void;
  setPlayback: (p: PlaybackState) => void;
  setApprovals: (a: ApprovalRequest[]) => void;
  addChat: (m: ChatMessage) => void;
  addReaction: (r: ReactionEvent) => void;
  toast: (n: Notice) => void;
  dismissToast: (id: string) => void;
  setLocalFile: (f: File | null) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as RoomStatus, error: undefined, connected: false, code: '', name: '',
  me: null, participants: [], playback: EMPTY_PLAYBACK, approvals: [], chat: [], reactions: [], toasts: [], localFile: null,
};

let seq = 0;
const uid = () => `${Date.now()}-${seq++}`;

export const useRoomStore = create<RoomState>((set, get) => ({
  ...initial,
  setStatus: (status, error) => set({ status, error }),
  setConnected: (connected) => set({ connected }),
  setSnapshot: (s) =>
    set({
      status: 'joined', error: undefined, code: s.code, name: s.name, me: s.you,
      participants: s.participants, playback: s.playback, approvals: s.approvals, chat: s.chat,
    }),
  setParticipants: (participants) => {
    const me = get().me;
    const mine = me && participants.find((p) => p.id === me.id);
    set({ participants, me: me && mine ? { ...me, role: mine.role } : me });
  },
  // ignore out-of-order updates
  setPlayback: (p) => set((st) => (p.version >= st.playback.version ? { playback: p } : {})),
  setApprovals: (approvals) => set({ approvals }),
  addChat: (m) => set((st) => ({ chat: [...st.chat.slice(-199), m] })),
  addReaction: (r) => {
    const id = uid();
    set((st) => ({ reactions: [...st.reactions.slice(-15), { ...r, id }] }));
    setTimeout(() => set((st) => ({ reactions: st.reactions.filter((x) => x.id !== id) })), 3200);
  },
  toast: (n) => {
    const id = uid();
    set((st) => ({ toasts: [...st.toasts.slice(-3), { ...n, id }] }));
    setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setLocalFile: (localFile) => set({ localFile }),
  reset: () => set({ ...initial }),
}));

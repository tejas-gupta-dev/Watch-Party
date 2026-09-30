import { useEffect, useMemo, useRef } from 'react';
import {
  ClientEvents, ServerEvents, canPerform,
  type Ack, type PlaybackAction, type Role, type RoomSnapshot,
} from '@watch-party/shared';
import { useAuth } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';
import { createSocket, type AppSocket } from './socket';
import { clock } from './clockSync';

export interface RoomActions {
  /** Runs the action directly if your role allows it, otherwise files an approval request. */
  control: (action: PlaybackAction) => void;
  assignRole: (targetId: string, role: Role) => void;
  removeParticipant: (targetId: string) => void;
  transferHost: (targetId: string) => void;
  approve: (requestId: string) => void;
  reject: (requestId: string) => void;
  chat: (text: string) => void;
  react: (emoji: string) => void;
  reportDrift: (driftMs: number) => void;
}

/** Owns the socket for one room: connect, join, subscribe, and re-join after reconnects. */
export function useRoomSocket(code: string): RoomActions {
  const token = useAuth((s) => s.token);
  const socketRef = useRef<AppSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const st = () => useRoomStore.getState();
    st().reset();
    st().setStatus('connecting');
    const socket = createSocket(token, code);
    socketRef.current = socket;

    const join = () =>
      socket.emit(ClientEvents.Join, { code }, (res: Ack<RoomSnapshot>) => {
        if (res.ok) {
          clock.seed(res.data.serverTime);
          st().setSnapshot(res.data); // after a reconnect this doubles as the fresh state snapshot
        } else {
          st().setStatus('error', res.error);
        }
      });

    socket.on('connect', () => { st().setConnected(true); clock.start(socket); join(); });
    socket.on('disconnect', () => st().setConnected(false));
    socket.on('connect_error', (e) => {
      if (e.message === 'Unauthorized') { st().setStatus('error', 'Your session expired. Sign in again.'); useAuth.getState().logout(); }
    });
    socket.on(ServerEvents.Participants, (p) => st().setParticipants(p));
    socket.on(ServerEvents.Playback, (p) => st().setPlayback(p));
    socket.on(ServerEvents.Approvals, (a) => st().setApprovals(a));
    socket.on(ServerEvents.Chat, (m) => st().addChat(m));
    socket.on(ServerEvents.Reaction, (r) => st().addReaction(r));
    socket.on(ServerEvents.Notice, (n) => st().toast(n));
    socket.on(ServerEvents.Kicked, () => { st().setStatus('kicked'); socket.disconnect(); });
    // server is deploying: drop the connection so the load balancer sends us to a healthy node
    socket.on(ServerEvents.Draining, () => setTimeout(() => socket.connected && socket.disconnect().connect(), Math.random() * 2000));

    return () => {
      clock.stop();
      socket.emit(ClientEvents.Leave);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, token]);

  return useMemo<RoomActions>(() => {
    const s = () => socketRef.current;
    return {
      control(action) {
        const me = useRoomStore.getState().me;
        const sock = s();
        if (!me || !sock) return;
        if (!canPerform(me.role, action.type)) return void sock.emit(ClientEvents.RequestAction, { action });
        switch (action.type) {
          case 'play': return void sock.emit(ClientEvents.Play, { position: action.position });
          case 'pause': return void sock.emit(ClientEvents.Pause, { position: action.position });
          case 'seek': return void sock.emit(ClientEvents.Seek, { position: action.position });
          case 'change_video': return void sock.emit(ClientEvents.ChangeVideo, { source: action.source });
        }
      },
      assignRole: (targetId, role) => void s()?.emit(ClientEvents.AssignRole, { targetId, role }),
      removeParticipant: (targetId) => void s()?.emit(ClientEvents.RemoveParticipant, { targetId }),
      transferHost: (targetId) => void s()?.emit(ClientEvents.TransferHost, { targetId }),
      approve: (requestId) => void s()?.emit(ClientEvents.Approve, { requestId }),
      reject: (requestId) => void s()?.emit(ClientEvents.Reject, { requestId }),
      chat: (text) => void s()?.emit(ClientEvents.Chat, { text }),
      react: (emoji) => void s()?.emit(ClientEvents.Reaction, { emoji }),
      reportDrift: (driftMs) => void s()?.emit(ClientEvents.ReportDrift, { driftMs }),
    };
  }, []);
}

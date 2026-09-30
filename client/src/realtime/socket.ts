import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@watch-party/shared';
import { API_BASE } from '../api/http';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * `room` goes in the query string so nginx can hash on it and keep every member of a
 * room on the same realtime node (see infra/nginx/nginx.conf).
 */
export function createSocket(token: string, room: string): AppSocket {
  return io(API_BASE || undefined, {
    auth: { token },
    query: { room },
    transports: ['websocket'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

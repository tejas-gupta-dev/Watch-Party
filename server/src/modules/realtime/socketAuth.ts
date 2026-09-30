import type { Socket } from 'socket.io';
import { verifyToken } from '../auth/auth.service';

/** Runs once per connection: rejects the handshake unless the JWT is valid. */
export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') throw new Error('missing token');
    socket.data.user = verifyToken(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
}

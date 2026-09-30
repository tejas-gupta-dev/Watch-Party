import type http from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../../config/env';
import { createPubSub } from '../../config/redis';
import { connectedSockets } from '../../infra/metrics';
import { logger } from '../../infra/logger';
import { RoomRegistry } from './RoomRegistry';
import { MessageHandler } from './MessageHandler';
import { socketAuth } from './socketAuth';

export function attachSocketServer(httpServer: http.Server) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN.split(','), credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    transports: ['websocket', 'polling'],
  });

  // Redis adapter: lets io.to(room).emit() reach sockets connected to OTHER nodes.
  const pubsub = createPubSub();
  if (pubsub) {
    io.adapter(createAdapter(pubsub.pub, pubsub.sub));
    logger.info('Socket.IO Redis adapter enabled');
  }

  const registry = new RoomRegistry(io);
  io.use(socketAuth);
  io.on('connection', (socket) => {
    connectedSockets.inc();
    new MessageHandler(io, registry, socket).register();
    socket.on('disconnect', () => connectedSockets.dec());
  });

  return { io, registry, pubsub };
}

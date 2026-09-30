import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { env } from './config/env';
import { closeDb, initDb } from './config/db';
import { closeRedis } from './config/redis';
import { logger } from './infra/logger';
import { lifecycle } from './infra/lifecycle';
import { ServerEvents } from '@watch-party/shared';
import { attachSocketServer } from './modules/realtime/socket.server';
import { startMatcherWorker } from './modules/matching/matcher.worker';
import { startTranscodeWorker } from './modules/media/transcode.worker';
import { ensureBucket } from './modules/media/storage';

export async function start(port = env.PORT) {
  await initDb();
  await ensureBucket().catch((err) => logger.warn({ err: String(err) }, 'object storage not reachable, uploads will fail'));

  const httpServer = http.createServer(createApp());
  const { io, registry, pubsub } = attachSocketServer(httpServer);
  const stopMatcher = startMatcherWorker();
  const stopTranscode = startTranscodeWorker();

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;
  logger.info({ port: actualPort }, 'server listening');

  /** Graceful drain: fail health checks, tell clients to reconnect elsewhere, then close. */
  async function close(drainMs = 0) {
    lifecycle.draining = true;
    io.emit(ServerEvents.Draining);
    if (drainMs) await new Promise((r) => setTimeout(r, drainMs));
    stopMatcher();
    stopTranscode();
    registry.shutdown();
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    pubsub?.pub.disconnect();
    pubsub?.sub.disconnect();
    await closeRedis();
    await closeDb();
    lifecycle.draining = false;
  }

  return { httpServer, io, port: actualPort, close };
}

if (env.NODE_ENV !== 'test') {
  start()
    .then((srv) => {
      const shutdown = (sig: string) => {
        logger.info({ sig }, 'shutting down (draining connections)');
        srv.close(5000).then(() => process.exit(0));
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error({ err }, 'failed to start');
      process.exit(1);
    });
}

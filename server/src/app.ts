import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { lifecycle } from './infra/lifecycle';
import { registry } from './infra/metrics';
import { authRouter } from './modules/auth/auth.routes';
import { roomRouter } from './modules/rooms/room.routes';
import { mediaRouter } from './modules/media/media.routes';
import { matchingRouter } from './modules/matching/matching.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind nginx: use X-Forwarded-For for rate limiting
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    if (lifecycle.draining) return void res.status(503).json({ status: 'draining', node: env.NODE_ID });
    res.json({ status: 'ok', node: env.NODE_ID });
  });
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/rooms', roomRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/matching', matchingRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

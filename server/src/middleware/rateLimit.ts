import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** In-memory counters are per node. Behind several nodes, back this with rate-limit-redis. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'production' ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

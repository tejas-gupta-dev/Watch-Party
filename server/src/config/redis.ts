import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { env } from './env';
import { logger } from '../infra/logger';

export const hasRealRedis = Boolean(env.REDIS_URL);

/** State client (room snapshots, chat history, matching queue). */
export const redis: Redis = hasRealRedis
  ? new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null })
  : (new RedisMock() as unknown as Redis);

if (!hasRealRedis) logger.warn('REDIS_URL not set: using in-memory Redis (single node only)');

/** Pub/sub pair for the Socket.IO Redis adapter (only when a real Redis exists). */
export function createPubSub(): { pub: Redis; sub: Redis } | null {
  if (!hasRealRedis) return null;
  return { pub: redis.duplicate(), sub: redis.duplicate() };
}

export async function closeRedis(): Promise<void> {
  await redis.quit().catch(() => undefined);
}

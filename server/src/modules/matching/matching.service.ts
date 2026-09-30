import { redis } from '../../config/redis';

const QUEUE = 'match:queue';
const WAITING = 'match:waiting';
const resultKey = (userId: string) => `match:result:${userId}`;

export interface Waiting { id: string; username: string }

export async function joinQueue(user: Waiting): Promise<void> {
  await redis.del(resultKey(user.id));
  // SADD returns 0 if the user is already waiting, so double clicks do not double-queue
  if ((await redis.sadd(WAITING, user.id)) === 1) await redis.rpush(QUEUE, JSON.stringify(user));
}

export async function leaveQueue(userId: string): Promise<void> {
  await redis.srem(WAITING, userId);
  const items = await redis.lrange(QUEUE, 0, -1);
  for (const item of items) if ((JSON.parse(item) as Waiting).id === userId) await redis.lrem(QUEUE, 0, item);
}

export async function matchStatus(userId: string): Promise<{ status: 'idle' | 'waiting' | 'matched'; code?: string }> {
  const code = await redis.get(resultKey(userId));
  if (code) return { status: 'matched', code };
  return { status: (await redis.sismember(WAITING, userId)) ? 'waiting' : 'idle' };
}

export async function setMatched(userId: string, code: string): Promise<void> {
  await redis.set(resultKey(userId), code, 'EX', 120);
}

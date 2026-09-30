import { redis } from '../../config/redis';
import { logger } from '../../infra/logger';
import { createRoom } from '../rooms/room.service';
import { setMatched, type Waiting } from './matching.service';

const QUEUE = 'match:queue';
const WAITING = 'match:waiting';

async function popWaiting(): Promise<Waiting | null> {
  // skip entries whose owner already left the queue
  for (;;) {
    const item = await redis.lpop(QUEUE);
    if (!item) return null;
    const user = JSON.parse(item) as Waiting;
    if ((await redis.srem(WAITING, user.id)) === 1) return user;
  }
}

async function tick(): Promise<void> {
  while ((await redis.llen(QUEUE)) >= 2) {
    const a = await popWaiting();
    if (!a) return;
    const b = await popWaiting();
    if (!b) {
      // put the first user back at the front and wait for a partner
      await redis.sadd(WAITING, a.id);
      await redis.lpush(QUEUE, JSON.stringify(a));
      return;
    }
    const room = await createRoom(a.id, `${a.username} & ${b.username}`);
    await Promise.all([setMatched(a.id, room.code), setMatched(b.id, room.code)]);
    logger.info({ code: room.code }, 'matched pair');
  }
}

/** Pairs waiting users into fresh rooms. Safe on several nodes: LPOP/SREM are atomic. */
export function startMatcherWorker(): () => void {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await tick(); } catch (err) { logger.error({ err }, 'matcher tick failed'); } finally { busy = false; }
  }, 1000);
  return () => clearInterval(timer);
}

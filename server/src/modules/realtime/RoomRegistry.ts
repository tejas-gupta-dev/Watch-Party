import type { Server } from 'socket.io';
import type { ChatMessage } from '@watch-party/shared';
import { redis } from '../../config/redis';
import { activeRooms } from '../../infra/metrics';
import { logger } from '../../infra/logger';
import { Room, type SerializedRoom } from '../rooms/Room';
import { getRoomRecord } from '../rooms/room.service';

const EVICT_AFTER_MS = 60_000;
const SNAPSHOT_TTL_S = 60 * 60 * 24;
const CHAT_KEEP = 100;
const stateKey = (code: string) => `room:${code}:state`;
const chatKey = (code: string) => `room:${code}:chat`;

/**
 * In-memory rooms for this node. Snapshots (roles + playback) and chat history are
 * mirrored to Redis so a room survives an empty period, a restart or a failover:
 * whichever node the next member lands on rebuilds the room from Redis.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room | null>>();
  private readonly evictTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly io: Server) {}

  get size(): number {
    return this.rooms.size;
  }

  async get(rawCode: string): Promise<Room | null> {
    const code = rawCode.toUpperCase();
    this.cancelEvict(code);
    const cached = this.rooms.get(code);
    if (cached) return cached;
    let p = this.loading.get(code);
    if (!p) {
      p = this.load(code).finally(() => this.loading.delete(code));
      this.loading.set(code, p);
    }
    return p;
  }

  private async load(code: string): Promise<Room | null> {
    let room: Room | null = null;
    const raw = await redis.get(stateKey(code));
    if (raw) {
      room = Room.hydrate(JSON.parse(raw) as SerializedRoom, this.io);
    } else {
      const record = await getRoomRecord(code);
      if (record) room = new Room(record.code, record.name, record.hostId, this.io);
    }
    if (room) {
      this.rooms.set(code, room);
      activeRooms.set(this.rooms.size);
      logger.info({ code }, 'room loaded');
    }
    return room;
  }

  async persist(room: Room): Promise<void> {
    await redis.set(stateKey(room.code), JSON.stringify(room.serialize()), 'EX', SNAPSHOT_TTL_S);
  }

  /** Called whenever a member disconnects/leaves: free memory once the room stays empty. */
  scheduleEvict(room: Room): void {
    if (room.hasOnline()) return;
    this.cancelEvict(room.code);
    this.evictTimers.set(
      room.code,
      setTimeout(async () => {
        this.evictTimers.delete(room.code);
        if (room.hasOnline()) return;
        await this.persist(room).catch(() => undefined);
        room.destroy();
        this.rooms.delete(room.code);
        activeRooms.set(this.rooms.size);
        logger.info({ code: room.code }, 'room evicted');
      }, EVICT_AFTER_MS),
    );
  }

  private cancelEvict(code: string) {
    const t = this.evictTimers.get(code);
    if (t) clearTimeout(t);
    this.evictTimers.delete(code);
  }

  async pushChat(code: string, msg: ChatMessage): Promise<void> {
    await redis.lpush(chatKey(code), JSON.stringify(msg));
    await redis.ltrim(chatKey(code), 0, CHAT_KEEP - 1);
    await redis.expire(chatKey(code), SNAPSHOT_TTL_S);
  }

  async chatHistory(code: string, limit = 50): Promise<ChatMessage[]> {
    const items = await redis.lrange(chatKey(code), 0, limit - 1);
    return items.map((i) => JSON.parse(i) as ChatMessage).reverse();
  }

  shutdown(): void {
    for (const t of this.evictTimers.values()) clearTimeout(t);
    for (const r of this.rooms.values()) r.destroy();
  }
}

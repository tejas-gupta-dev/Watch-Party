import { randomInt } from 'node:crypto';
import { pool } from '../../config/db';
import { AppError } from '../../middleware/errorHandler';

export interface RoomRecord {
  code: string;
  name: string;
  hostId: string;
}

// no 0/O/1/I so codes are easy to read aloud
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export async function createRoom(hostId: string, name?: string): Promise<RoomRecord> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const exists = await pool.query('SELECT 1 FROM rooms WHERE code = $1', [code]);
    if (exists.rowCount) continue;
    const roomName = (name?.trim() || `Room ${code}`).slice(0, 60);
    try {
      await pool.query('INSERT INTO rooms (code, name, host_id) VALUES ($1, $2, $3)', [code, roomName, hostId]);
      return { code, name: roomName, hostId };
    } catch {
      /* lost a race on the primary key, try another code */
    }
  }
  throw new AppError('Could not allocate a room code, try again', 503);
}

export async function getRoomRecord(code: string): Promise<RoomRecord | null> {
  const { rows } = await pool.query('SELECT code, name, host_id FROM rooms WHERE code = $1', [code.toUpperCase()]);
  const r = rows[0];
  return r ? { code: r.code, name: r.name, hostId: r.host_id } : null;
}

export async function updateHost(code: string, hostId: string): Promise<void> {
  await pool.query('UPDATE rooms SET host_id = $1 WHERE code = $2', [hostId, code]);
}

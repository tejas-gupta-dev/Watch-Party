import pg from 'pg';
import { newDb } from 'pg-mem';
import { env } from './env';
import { logger } from '../infra/logger';

export let pool: pg.Pool;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id text PRIMARY KEY,
     username text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     created_at timestamptz DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS rooms (
     code text PRIMARY KEY,
     name text NOT NULL,
     host_id text NOT NULL,
     created_at timestamptz DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS media (
     id text PRIMARY KEY,
     owner_id text NOT NULL,
     key text NOT NULL,
     filename text NOT NULL,
     content_type text NOT NULL,
     status text NOT NULL,
     created_at timestamptz DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS rooms_host_idx ON rooms (host_id)`,
];

export async function initDb(): Promise<void> {
  if (env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  } else {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    pool = new Pool() as unknown as pg.Pool;
    logger.warn('DATABASE_URL not set: using in-memory Postgres (data is lost on restart)');
  }
  for (const sql of SCHEMA) {
    try {
      await pool.query(sql);
    } catch (err) {
      // two nodes booting together may race on CREATE; the loser can ignore it
      const msg = String((err as Error).message);
      if (!/already exists|duplicate key/i.test(msg)) throw err;
    }
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end().catch(() => undefined);
}

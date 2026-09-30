import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export interface AuthUser {
  id: string;
  username: string;
  guest: boolean;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, username: user.username, guest: user.guest }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthUser {
  const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  if (!p.sub || typeof p.username !== 'string') throw new Error('bad token');
  return { id: p.sub, username: p.username, guest: Boolean(p.guest) };
}

/** Guests are not stored: a signed token with a random id is enough to join rooms. */
export function createGuest(username: string): { user: AuthUser; token: string } {
  const user: AuthUser = { id: `g_${randomUUID()}`, username, guest: true };
  return { user, token: signToken(user) };
}

export async function register(username: string, password: string) {
  const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (exists.rowCount) throw new AppError('That username is taken', 409);
  const id = `u_${randomUUID()}`;
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)', [id, username, hash]);
  const user: AuthUser = { id, username, guest: false };
  return { user, token: signToken(user) };
}

export async function login(username: string, password: string) {
  const { rows } = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError('Wrong username or password', 401);
  }
  const user: AuthUser = { id: row.id, username: row.username, guest: false };
  return { user, token: signToken(user) };
}

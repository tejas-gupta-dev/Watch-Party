import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, type PlaybackState, type RoomSnapshot } from '@watch-party/shared';
import { start } from '../../src/index';

let srv: Awaited<ReturnType<typeof start>>;
let base: string;
const sockets: Socket[] = [];

async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}
const guest = (username: string) => api<{ token: string; user: { id: string } }>('/api/auth/guest', undefined, { username });

async function join(token: string, code: string) {
  const s = connect(base, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
  const snapshot = await new Promise<RoomSnapshot>((res, rej) =>
    s.emit(ClientEvents.Join, { code }, (r: { ok: boolean; data: RoomSnapshot; error: string }) => (r.ok ? res(r.data) : rej(new Error(r.error)))));
  return { s, snapshot };
}
const once = <T>(s: Socket, ev: string) => new Promise<T>((res) => s.once(ev, res));

beforeAll(async () => { srv = await start(0); base = `http://localhost:${srv.port}`; });
afterAll(async () => { sockets.forEach((s) => s.disconnect()); await srv.close(); });

describe('watch party flow', () => {
  it('rejects sockets without a valid token', async () => {
    const s = connect(base, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    const err = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(err.message).toBe('Unauthorized');
  });

  it('host controls sync to members; participants need approval', async () => {
    const host = await guest('Hosty');
    const bob = await guest('Bob');
    const room = await api<{ code: string }>('/api/rooms', host.token, {});
    const h = await join(host.token, room.code);
    const b = await join(bob.token, room.code);
    expect(h.snapshot.you.role).toBe('host');
    expect(b.snapshot.you.role).toBe('participant');

    // host picks a video, everyone gets it
    const source = { type: 'youtube', videoId: 'dQw4w9WgXcQ' };
    const changed = once<PlaybackState>(b.s, ServerEvents.Playback);
    h.s.emit(ClientEvents.ChangeVideo, { source });
    expect((await changed).source).toEqual(source);

    // host plays -> participant sees playing state anchored at the server time
    const played = once<PlaybackState>(b.s, ServerEvents.Playback);
    h.s.emit(ClientEvents.Play, { position: 12 });
    expect(await played).toMatchObject({ playing: true, position: 12 });

    // participant cannot pause directly
    const denied = once<{ message: string }>(b.s, ServerEvents.Notice);
    b.s.emit(ClientEvents.Pause, { position: 20 });
    expect((await denied).message).toMatch(/permission/);

    // ...but can request, and the host sees it in the queue and approves
    const queue = once<{ id: string }[]>(h.s, ServerEvents.Approvals);
    b.s.emit(ClientEvents.RequestAction, { action: { type: 'pause', position: 20 } });
    const [req] = await queue;
    const paused = once<PlaybackState>(b.s, ServerEvents.Playback);
    h.s.emit(ClientEvents.Approve, { requestId: req.id });
    expect(await paused).toMatchObject({ playing: false, position: 20 });
  });

  it('host promotes a moderator who can then control playback', async () => {
    const host = await guest('H2');
    const mod = await guest('M2');
    const room = await api<{ code: string }>('/api/rooms', host.token, {});
    const h = await join(host.token, room.code);
    const m = await join(mod.token, room.code);
    h.s.emit(ClientEvents.ChangeVideo, { source: { type: 'youtube', videoId: 'dQw4w9WgXcQ' } });
    await once(m.s, ServerEvents.Playback);
    h.s.emit(ClientEvents.AssignRole, { targetId: mod.user.id, role: 'moderator' });
    await once(m.s, ServerEvents.Notice);
    const st = once<PlaybackState>(h.s, ServerEvents.Playback);
    m.s.emit(ClientEvents.Seek, { position: 33 });
    expect((await st).position).toBe(33);
  });

  it('chat is broadcast and clock ping returns server time', async () => {
    const a = await guest('A3');
    const room = await api<{ code: string }>('/api/rooms', a.token, {});
    const { s } = await join(a.token, room.code);
    const msg = once<{ text: string }>(s, ServerEvents.Chat);
    s.emit(ClientEvents.Chat, { text: 'hello' });
    expect((await msg).text).toBe('hello');
    const t = await new Promise<number>((res) => s.emit(ClientEvents.ClockPing, res));
    expect(Math.abs(t - Date.now())).toBeLessThan(2000);
  });

  it('matching pairs two waiting users into a room', async () => {
    const a = await guest('MA');
    const b = await guest('MB');
    await api('/api/matching/join', a.token, {});
    await api('/api/matching/join', b.token, {});
    let status: { status: string; code?: string } = { status: 'waiting' };
    for (let i = 0; i < 20 && status.status !== 'matched'; i++) {
      await new Promise((r) => setTimeout(r, 300));
      status = await api('/api/matching/status', a.token);
    }
    expect(status.status).toBe('matched');
    expect((await api<{ code?: string }>('/api/matching/status', b.token)).code).toBe(status.code);
  });
});

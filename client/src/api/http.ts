import type { User } from '../store/authStore';
import { useAuth } from '../store/authStore';

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) useAuth.getState().logout();
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

interface Session { token: string; user: User }
export interface MediaInfo { id: string; filename: string; status: 'uploading' | 'processing' | 'ready' | 'failed'; url: string | null }
export type MatchStatus = { status: 'idle' | 'waiting' | 'matched'; code?: string };

export const api = {
  guest: (username: string) => request<Session>('/api/auth/guest', { body: { username } }),
  register: (username: string, password: string) => request<Session>('/api/auth/register', { body: { username, password } }),
  login: (username: string, password: string) => request<Session>('/api/auth/login', { body: { username, password } }),
  createRoom: (name?: string) => request<{ code: string; name: string }>('/api/rooms', { body: { name } }),
  getRoom: (code: string) => request<{ code: string; name: string }>(`/api/rooms/${encodeURIComponent(code)}`),
  uploadUrl: (filename: string, contentType: string, size: number) =>
    request<{ mediaId: string; uploadUrl: string }>('/api/media/upload-url', { body: { filename, contentType, size } }),
  completeUpload: (id: string) => request<{ mediaId: string; status: MediaInfo['status'] }>(`/api/media/${id}/complete`, { method: 'POST', body: {} }),
  getMedia: (id: string) => request<MediaInfo>(`/api/media/${id}`),
  matchJoin: () => request<MatchStatus>('/api/matching/join', { method: 'POST', body: {} }),
  matchLeave: () => request<MatchStatus>('/api/matching/leave', { method: 'POST', body: {} }),
  matchStatus: () => request<MatchStatus>('/api/matching/status'),
};

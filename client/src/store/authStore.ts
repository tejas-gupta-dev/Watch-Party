import { create } from 'zustand';

export interface User { id: string; username: string; guest: boolean }
interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

const KEY = 'wp.session';
function load(): { token: string | null; user: User | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { token: null, user: null };
}

export const useAuth = create<AuthState>((set) => ({
  ...load(),
  setSession: (token, user) => {
    try { localStorage.setItem(KEY, JSON.stringify({ token, user })); } catch { /* ignore */ }
    set({ token, user });
  },
  logout: () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    set({ token: null, user: null });
  },
}));

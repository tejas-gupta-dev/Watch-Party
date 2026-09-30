import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/http';
import { useAuth } from '../store/authStore';

export default function Home() {
  const { user, token, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [guestName, setGuestName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState(params.get('join') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval>>();

  const stopPolling = () => { if (poll.current) clearInterval(poll.current); poll.current = undefined; };
  useEffect(() => stopPolling, []);

  // arrived via an invite link and already signed in: go straight in
  useEffect(() => {
    const join = params.get('join');
    if (token && join) navigate(`/room/${join.toUpperCase()}`, { replace: true });
  }, [token, params, navigate]);

  async function guest(e: FormEvent) {
    e.preventDefault();
    setError('');
    try { const s = await api.guest(guestName); setSession(s.token, s.user); } catch (err) { setError((err as Error).message); }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const r = await api.createRoom(roomName || undefined); navigate(`/room/${r.code}`); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { const r = await api.getRoom(code.trim()); navigate(`/room/${r.code}`); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function findPartner() {
    setError(''); setMatching(true);
    try {
      await api.matchJoin();
      poll.current = setInterval(async () => {
        try {
          const s = await api.matchStatus();
          if (s.status === 'matched' && s.code) { stopPolling(); setMatching(false); navigate(`/room/${s.code}`); }
        } catch (err) { stopPolling(); setMatching(false); setError((err as Error).message); }
      }, 2000);
    } catch (err) { setMatching(false); setError((err as Error).message); }
  }
  async function cancelMatch() { stopPolling(); setMatching(false); await api.matchLeave().catch(() => undefined); }

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">Watch Party</span>
        {user ? (
          <span className="who">{user.username}{user.guest && ' (guest)'} <button className="link" onClick={logout}>Sign out</button></span>
        ) : (
          <Link to={`/login${params.get('join') ? `?join=${params.get('join')}` : ''}`} className="link">Sign in</Link>
        )}
      </header>

      <section className="hero">
        <h1>Same movie. Same second. Different couches.</h1>
        <p>Start a room, share the code, and everyone's video stays in sync — pause once and it pauses for everyone.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {!user ? (
        <form className="panel stack" onSubmit={guest}>
          <h2>Pick a name to get started</h2>
          <label>Display name<input value={guestName} onChange={(e) => setGuestName(e.target.value)} required minLength={2} maxLength={24} placeholder="e.g. Maya" /></label>
          <button className="primary">Continue as guest</button>
          <p className="muted">Or <Link to="/login">sign in</Link> to keep an account.</p>
        </form>
      ) : (
        <div className="grid2">
          <form className="panel stack" onSubmit={create}>
            <h2>Host a room</h2>
            <label>Room name <span className="muted">(optional)</span><input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={60} placeholder="Friday movie night" /></label>
            <button className="primary" disabled={busy}>Create room</button>
          </form>
          <form className="panel stack" onSubmit={join}>
            <h2>Join with a code</h2>
            <label>Room code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={4} maxLength={12} placeholder="K7M2QX" className="code" /></label>
            <button className="primary" disabled={busy}>Join room</button>
          </form>
          <div className="panel stack wide">
            <h2>No one to watch with?</h2>
            <p className="muted">We'll pair you with the next person looking for company and open a room for you both.</p>
            {matching
              ? <button onClick={cancelMatch}><span className="pulse" /> Looking for a partner… Cancel</button>
              : <button onClick={findPartner}>Find a watch partner</button>}
          </div>
        </div>
      )}
    </main>
  );
}

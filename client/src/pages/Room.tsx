import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { canPerform } from '@watch-party/shared';
import { useAuth } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';
import { useRoomSocket } from '../realtime/useRoomSocket';
import VideoStage from '../components/VideoStage';
import SourcePicker from '../components/SourcePicker';
import ParticipantList from '../components/ParticipantList';
import ApprovalQueue from '../components/ApprovalQueue';
import ChatPanel from '../components/ChatPanel';

export default function Room() {
  const { code = '' } = useParams();
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to={`/?join=${code}`} replace />;
  return <RoomInner code={code.toUpperCase()} />;
}

function RoomInner({ code }: { code: string }) {
  const actions = useRoomSocket(code);
  const navigate = useNavigate();
  const { status, error, connected, name, me, toasts, dismissToast } = useRoomStore();

  useEffect(() => { document.title = name ? `${name} · Watch Party` : 'Watch Party'; return () => { document.title = 'Watch Party'; }; }, [name]);

  if (status === 'kicked') {
    return <main className="shell narrow"><div className="panel stack"><h1>You left this room</h1><p>You were removed, or you opened the room in another tab.</p><Link className="primary btn" to="/">Back to start</Link></div></main>;
  }
  if (status === 'error') {
    return <main className="shell narrow"><div className="panel stack"><h1>Can't open this room</h1><p className="error">{error}</p><Link className="primary btn" to="/">Back to start</Link></div></main>;
  }
  if (status !== 'joined' || !me) {
    return <main className="shell narrow"><div className="panel"><p><span className="pulse" /> Joining room {code}…</p></div></main>;
  }

  const canApprove = canPerform(me.role, 'approve_request');
  const invite = `${location.origin}/?join=${code}`;

  return (
    <div className="room">
      <header className="topbar room-top">
        <button className="link" onClick={() => navigate('/')}>← Leave</button>
        <h1 className="room-name">{name}</h1>
        <div className="top-right">
          <button className="chip" title="Copy invite link" onClick={() => { void navigator.clipboard?.writeText(invite); useRoomStore.getState().toast({ level: 'info', message: 'Invite link copied' }); }}>
            Code <strong>{code}</strong>
          </button>
          <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
        </div>
      </header>

      {!connected && <div className="banner" role="status">Connection lost. Reconnecting and re-syncing…</div>}

      <div className="room-body">
        <section className="stage-col">
          <VideoStage actions={actions} />
          <SourcePicker actions={actions} />
        </section>
        <aside className="side-col">
          <ParticipantList actions={actions} />
          {canApprove && <ApprovalQueue actions={actions} />}
          <ChatPanel actions={actions} />
        </aside>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} className={`toast ${t.level}`} onClick={() => dismissToast(t.id)}>{t.message}</button>
        ))}
      </div>
    </div>
  );
}

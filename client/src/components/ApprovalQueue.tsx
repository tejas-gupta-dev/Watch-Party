import type { PlaybackAction } from '@watch-party/shared';
import type { RoomActions } from '../realtime/useRoomSocket';
import { useRoomStore } from '../store/roomStore';
import { formatTime } from '../utils/format';

function describe(a: PlaybackAction): string {
  switch (a.type) {
    case 'play': return `wants to play from ${formatTime(a.position)}`;
    case 'pause': return `wants to pause at ${formatTime(a.position)}`;
    case 'seek': return `wants to jump to ${formatTime(a.position)}`;
    case 'change_video': return `wants to switch to ${a.source.title ?? a.source.type}`;
  }
}

export default function ApprovalQueue({ actions }: { actions: RoomActions }) {
  const approvals = useRoomStore((s) => s.approvals);
  return (
    <section className="panel">
      <h2>Requests {approvals.length > 0 && <span className="badge alert">{approvals.length}</span>}</h2>
      {approvals.length === 0 ? <p className="muted">No pending requests.</p> : (
        <ul className="requests">
          {approvals.map((r) => (
            <li key={r.id}>
              <span><strong>{r.username}</strong> {describe(r.action)}</span>
              <span className="row-btns">
                <button className="mini ok" onClick={() => actions.approve(r.id)}>Approve</button>
                <button className="mini" onClick={() => actions.reject(r.id)}>Decline</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

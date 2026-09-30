import type { RoomActions } from '../realtime/useRoomSocket';
import { useRoomStore } from '../store/roomStore';
import RoleMenu from './RoleMenu';

export default function ParticipantList({ actions }: { actions: RoomActions }) {
  const participants = useRoomStore((s) => s.participants);
  const me = useRoomStore((s) => s.me);
  if (!me) return null;
  return (
    <section className="panel">
      <h2>In the room <span className="muted">{participants.filter((p) => p.online).length}</span></h2>
      <ul className="people">
        {participants.map((p) => (
          <li key={p.id} className={p.online ? '' : 'offline'}>
            <span className={`dot ${p.online ? 'on' : 'off'}`} />
            <span className="pname">{p.username}{p.id === me.id && ' (you)'}</span>
            <span className={`badge ${p.role}`}>{p.role}</span>
            {p.id !== me.id && <RoleMenu target={p} myRole={me.role} actions={actions} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

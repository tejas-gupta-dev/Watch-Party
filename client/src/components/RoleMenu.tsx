import { ASSIGNABLE_ROLES, Role, canPerform, canRemove, type ParticipantDTO } from '@watch-party/shared';
import type { RoomActions } from '../realtime/useRoomSocket';

/** Per-member actions. Only renders what the viewer's role allows. */
export default function RoleMenu({ target, myRole, actions }: { target: ParticipantDTO; myRole: Role; actions: RoomActions }) {
  const canAssign = canPerform(myRole, 'assign_role') && target.role !== Role.Host;
  const canKick = canRemove(myRole, target.role);
  const canTransfer = canPerform(myRole, 'transfer_host') && target.role !== Role.Host;
  if (!canAssign && !canKick && !canTransfer) return null;

  return (
    <span className="role-menu">
      {canAssign && (
        <select value={target.role} aria-label={`Role for ${target.username}`} onChange={(e) => actions.assignRole(target.id, e.target.value as Role)}>
          {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {canTransfer && (
        <button className="mini" title="Make host" onClick={() => confirm(`Make ${target.username} the host? You become a moderator.`) && actions.transferHost(target.id)}>Make host</button>
      )}
      {canKick && (
        <button className="mini danger" onClick={() => confirm(`Remove ${target.username} from the room?`) && actions.removeParticipant(target.id)}>Remove</button>
      )}
    </span>
  );
}

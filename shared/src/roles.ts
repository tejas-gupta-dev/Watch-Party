export enum Role {
  Host = 'host',
  Moderator = 'moderator',
  Participant = 'participant',
}

export type Action =
  | 'play'
  | 'pause'
  | 'seek'
  | 'change_video'
  | 'assign_role'
  | 'remove_participant'
  | 'transfer_host'
  | 'approve_request'
  | 'chat';

/** Permission matrix: the single source of truth for client UI and server enforcement. */
export const PERMISSIONS: Record<Role, readonly Action[]> = {
  [Role.Host]: [
    'play', 'pause', 'seek', 'change_video',
    'assign_role', 'remove_participant', 'transfer_host', 'approve_request', 'chat',
  ],
  [Role.Moderator]: [
    'play', 'pause', 'seek', 'change_video',
    'remove_participant', 'approve_request', 'chat',
  ],
  [Role.Participant]: ['chat'],
};

export function canPerform(role: Role | undefined | null, action: Action): boolean {
  return !!role && PERMISSIONS[role].includes(action);
}

/** Roles the host may hand out (host is only reachable through transfer_host). */
export const ASSIGNABLE_ROLES: readonly Role[] = [Role.Moderator, Role.Participant];

/** Can `actor` remove `target` from the room? Hosts remove anyone; mods only plain participants. */
export function canRemove(actor: Role, target: Role): boolean {
  if (!canPerform(actor, 'remove_participant')) return false;
  if (actor === Role.Host) return target !== Role.Host;
  return target === Role.Participant;
}

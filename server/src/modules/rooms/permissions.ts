import { canPerform, canRemove, type Action, Role } from '@watch-party/shared';
import { AppError } from '../../middleware/errorHandler';
import type { Room } from './Room';

export { canPerform, canRemove };

/** Every handler calls this BEFORE touching room state. */
export function assertCan(room: Room, userId: string, action: Action): Role {
  const role = room.roleOf(userId);
  if (!role || !canPerform(role, action)) {
    throw new AppError('You do not have permission to do that', 403);
  }
  return role;
}

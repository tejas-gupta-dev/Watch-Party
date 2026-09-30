import { Role, ServerEvents, canRemove } from '@watch-party/shared';
import { AppError } from '../../../middleware/errorHandler';
import { assertCan } from '../../rooms/permissions';
import { updateHost } from '../../rooms/room.service';
import type { Handler } from '../MessageHandler';

export const handleAssignRole: Handler<{ targetId: string; role: string }> = async (ctx, { targetId, role }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'assign_role');
  if (targetId === ctx.user.id) throw new AppError('You cannot change your own role', 400);
  if (!room.has(targetId)) throw new AppError('That person is not in the room', 404);
  room.setRole(targetId, role as Role);
  room.broadcastParticipants();
  room.broadcastApprovals(); // a new moderator should see the queue immediately
  room.emitTo(targetId, ServerEvents.Notice, { level: 'info', message: `You are now a ${role}` });
  await ctx.registry.persist(room);
};

export const handleRemove: Handler<{ targetId: string }> = async (ctx, { targetId }) => {
  const room = await ctx.requireRoom();
  const actorRole = assertCan(room, ctx.user.id, 'remove_participant');
  const target = room.getParticipant(targetId);
  if (!target) throw new AppError('That person is not in the room', 404);
  if (!canRemove(actorRole, target.role)) throw new AppError('You cannot remove that person', 403);
  const socketId = room.kick(targetId);
  if (socketId) {
    ctx.io.to(socketId).emit(ServerEvents.Kicked);
    ctx.io.in(socketId).socketsLeave(room.code);
  }
  room.broadcastParticipants();
  room.broadcastApprovals();
  await ctx.registry.persist(room);
};

export const handleTransferHost: Handler<{ targetId: string }> = async (ctx, { targetId }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'transfer_host');
  if (targetId === ctx.user.id) throw new AppError('You are already the host', 400);
  if (!room.has(targetId)) throw new AppError('That person is not in the room', 404);
  room.transferHost(targetId);
  await updateHost(room.code, targetId);
  room.broadcastParticipants();
  room.broadcastApprovals();
  room.emitTo(targetId, ServerEvents.Notice, { level: 'info', message: 'You are now the host' });
  await ctx.registry.persist(room);
};

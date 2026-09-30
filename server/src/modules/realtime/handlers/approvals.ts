import { ServerEvents, canPerform, type PlaybackAction } from '@watch-party/shared';
import { AppError } from '../../../middleware/errorHandler';
import { assertCan } from '../../rooms/permissions';
import type { Handler } from '../MessageHandler';
import { performAction } from './playback';

/** A member without direct rights asks for a playback change; mods/host approve or reject. */
export const handleRequestAction: Handler<{ action: PlaybackAction }> = async (ctx, { action }) => {
  const room = await ctx.requireRoom();
  const role = room.roleOf(ctx.user.id)!;
  if (canPerform(role, action.type)) throw new AppError('You can do that directly', 400);
  if (action.type !== 'change_video' && !room.playback.source) throw new AppError('Pick a video first', 400);
  room.addApproval(ctx.user, action);
  room.broadcastApprovals();
  ctx.socket.emit(ServerEvents.Notice, { level: 'info', message: 'Request sent to the host and moderators' });
};

export const handleApprove: Handler<{ requestId: string }> = async (ctx, { requestId }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'approve_request');
  const req = room.takeApproval(requestId);
  if (!req) throw new AppError('That request is no longer pending', 404);
  await performAction(ctx, room, req.action);
  room.broadcastApprovals();
  room.emitTo(req.userId, ServerEvents.Notice, { level: 'info', message: 'Your request was approved' });
};

export const handleReject: Handler<{ requestId: string }> = async (ctx, { requestId }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'approve_request');
  const req = room.takeApproval(requestId);
  if (!req) throw new AppError('That request is no longer pending', 404);
  room.broadcastApprovals();
  room.emitTo(req.userId, ServerEvents.Notice, { level: 'error', message: 'Your request was declined' });
};

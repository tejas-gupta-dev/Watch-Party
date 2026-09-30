import { ServerEvents, type PlaybackAction } from '@watch-party/shared';
import { AppError } from '../../../middleware/errorHandler';
import type { Room } from '../../rooms/Room';
import { assertCan } from '../../rooms/permissions';
import type { Ctx, Handler } from '../MessageHandler';

/** Applies an action and broadcasts the new state. Shared with the approval flow. */
export async function performAction(ctx: Ctx, room: Room, action: PlaybackAction): Promise<void> {
  if (action.type !== 'change_video' && !room.playback.source) {
    throw new AppError('Pick a video first', 400);
  }
  room.applyAction(action);
  room.broadcast(ServerEvents.Playback, room.playback);
  await ctx.registry.persist(room);
}

async function direct(ctx: Ctx, action: PlaybackAction) {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, action.type);
  await performAction(ctx, room, action);
}

export const handlePlay: Handler<{ position: number }> = (ctx, p) => direct(ctx, { type: 'play', position: p.position });
export const handlePause: Handler<{ position: number }> = (ctx, p) => direct(ctx, { type: 'pause', position: p.position });
export const handleSeek: Handler<{ position: number }> = (ctx, p) => direct(ctx, { type: 'seek', position: p.position });
export const handleChangeVideo: Handler<{ source: import('@watch-party/shared').Source }> = (ctx, p) =>
  direct(ctx, { type: 'change_video', source: p.source });

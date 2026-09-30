import { randomUUID } from 'node:crypto';
import { ServerEvents, type ChatMessage } from '@watch-party/shared';
import { assertCan } from '../../rooms/permissions';
import type { Handler } from '../MessageHandler';

export const handleChat: Handler<{ text: string }> = async (ctx, { text }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'chat');
  const msg: ChatMessage = { id: randomUUID(), userId: ctx.user.id, username: ctx.user.username, text, ts: Date.now() };
  room.broadcast(ServerEvents.Chat, msg);
  await ctx.registry.pushChat(room.code, msg);
};

export const handleReaction: Handler<{ emoji: string }> = async (ctx, { emoji }) => {
  const room = await ctx.requireRoom();
  assertCan(room, ctx.user.id, 'chat');
  room.broadcast(ServerEvents.Reaction, { userId: ctx.user.id, username: ctx.user.username, emoji, ts: Date.now() });
};

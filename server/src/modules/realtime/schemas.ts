import { z } from 'zod';
import { ASSIGNABLE_ROLES, REACTIONS, type Source, type PlaybackAction } from '@watch-party/shared';

export const sourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('youtube'), videoId: z.string().regex(/^[\w-]{11}$/), title: z.string().max(200).optional() }),
  z.object({ type: z.literal('file'), mediaId: z.string().min(1).max(64), title: z.string().max(200).optional() }),
  z.object({ type: z.literal('local'), filename: z.string().min(1).max(255), size: z.number().int().nonnegative(), title: z.string().max(200).optional() }),
]) as unknown as z.ZodType<Source>;

const position = z.number().finite().min(0).max(60 * 60 * 24);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), position }),
  z.object({ type: z.literal('pause'), position }),
  z.object({ type: z.literal('seek'), position }),
  z.object({ type: z.literal('change_video'), source: sourceSchema }),
]) as unknown as z.ZodType<PlaybackAction>;

export const schemas = {
  any: z.any(),
  join: z.object({ code: z.string().trim().min(4).max(12) }),
  position: z.object({ position }),
  changeVideo: z.object({ source: sourceSchema }),
  assignRole: z.object({
    targetId: z.string().min(1).max(80),
    role: z.enum(ASSIGNABLE_ROLES as unknown as [string, ...string[]]),
  }),
  target: z.object({ targetId: z.string().min(1).max(80) }),
  requestAction: z.object({ action: actionSchema }),
  requestId: z.object({ requestId: z.string().min(1).max(80) }),
  chat: z.object({ text: z.string().trim().min(1).max(500) }),
  reaction: z.object({ emoji: z.enum(REACTIONS) }),
  drift: z.object({ driftMs: z.number().finite() }),
};

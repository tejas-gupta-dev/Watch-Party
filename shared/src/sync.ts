import type { PlaybackState } from './events';

/**
 * Where playback *should* be right now. Playback state is stored as an anchor
 * (position at server time `updatedAt`), so every client can compute the same
 * position from its own clock once corrected by the server clock offset.
 */
export function currentPosition(
  s: Pick<PlaybackState, 'playing' | 'position' | 'updatedAt'>,
  serverNow: number,
): number {
  if (!s.playing) return s.position;
  return Math.max(0, s.position + (serverNow - s.updatedAt) / 1000);
}

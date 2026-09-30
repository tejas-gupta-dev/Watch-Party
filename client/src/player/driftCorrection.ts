export type Correction =
  | { kind: 'none' }
  | { kind: 'seek' }
  | { kind: 'rate'; rate: number };

const SEEK_THRESHOLD_FINE = 1.0; // players with adjustable rate: seek only if badly off
const SEEK_THRESHOLD_COARSE = 0.8; // YouTube: no fine rate, so seek sooner
const DEADZONE = 0.12; // below this, leave playback alone (it is inaudible)
const MAX_NUDGE = 0.08; // at most +-8% speed while catching up

/**
 * @param drift seconds; positive means this player is AHEAD of the room
 *
 * Small drift: nudge playbackRate so it converges invisibly.
 * Large drift: a jump (seek) is quicker than a slow catch-up.
 */
export function decideCorrection(drift: number, canSetRate: boolean): Correction {
  const abs = Math.abs(drift);
  if (abs > (canSetRate ? SEEK_THRESHOLD_FINE : SEEK_THRESHOLD_COARSE)) return { kind: 'seek' };
  if (!canSetRate) return { kind: 'none' };
  if (abs < DEADZONE) return { kind: 'rate', rate: 1 };
  const nudge = Math.min(MAX_NUDGE, abs * 0.5);
  return { kind: 'rate', rate: drift > 0 ? 1 - nudge : 1 + nudge };
}

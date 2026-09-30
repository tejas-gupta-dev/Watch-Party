import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { currentPosition, type PlaybackState } from '@watch-party/shared';
import { clock } from '../realtime/clockSync';
import { decideCorrection } from './driftCorrection';
import type { PlayerAdapter } from './PlayerAdapter';

/**
 * Applies the server's playback state to whichever adapter is active.
 *  - hard sync: whenever the state changes (or the video finishes loading)
 *  - soft sync: once a second while playing, measure drift and correct it
 * Returns `blocked` (browser refused autoplay) and `resume` (a click handler that fixes it).
 */
export function useSyncedPlayer(
  adapterRef: MutableRefObject<PlayerAdapter | null>,
  loadedKey: string | null,
  playback: PlaybackState,
  reportDrift: (ms: number) => void,
) {
  const [blocked, setBlocked] = useState(false);
  const latest = useRef(playback);
  latest.current = playback;

  const hardSync = useCallback(async () => {
    const a = adapterRef.current;
    const pb = latest.current;
    if (!a || !loadedKey) return;
    const target = currentPosition(pb, clock.now());
    if (!pb.playing || Math.abs(a.getTime() - target) > 0.3) a.seek(target);
    a.setRate(1);
    if (!pb.playing) { a.pause(); setBlocked(false); return; }
    try {
      await a.play();
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') return void setBlocked(true);
    }
    // YouTube gives no error on blocked autoplay: check that it really started
    setTimeout(() => {
      if (latest.current.playing && adapterRef.current?.isPaused()) setBlocked(true);
      else setBlocked(false);
    }, 1500);
  }, [adapterRef, loadedKey]);

  useEffect(() => { void hardSync(); }, [hardSync, playback.version, playback.playing, playback.position, playback.updatedAt]);

  useEffect(() => {
    let tick = 0;
    const id = setInterval(() => {
      const a = adapterRef.current;
      const pb = latest.current;
      if (!a || !loadedKey || !pb.playing || a.isPaused()) return;
      const target = currentPosition(pb, clock.now());
      const drift = a.getTime() - target;
      const fix = decideCorrection(drift, a.canSetRate);
      if (fix.kind === 'seek') a.seek(target);
      else if (fix.kind === 'rate') a.setRate(fix.rate);
      if (++tick % 10 === 0) reportDrift(drift * 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [adapterRef, loadedKey, reportDrift]);

  return { blocked, resume: hardSync };
}

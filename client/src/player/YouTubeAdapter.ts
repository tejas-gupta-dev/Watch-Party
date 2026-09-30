import type { LoadTarget, PlayerAdapter } from './PlayerAdapter';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<any> | null = null;
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

/** IFrame API wrapper. Native controls are disabled: all control goes through the room. */
export class YouTubeAdapter implements PlayerAdapter {
  /** YouTube only offers coarse rates (0.75, 1, 1.25), so drift is fixed by seeking instead */
  readonly canSetRate = false;
  private player: any = null;
  private readonly host: HTMLElement;
  private onCued?: () => void;

  constructor(container: HTMLElement) {
    // YT replaces its target node; give it a private one so React's container stays intact
    this.host = document.createElement('div');
    container.appendChild(this.host);
  }

  async load(target: LoadTarget): Promise<void> {
    if (target.kind !== 'youtube') throw new Error('YouTubeAdapter needs a video id');
    const YT = await loadApi();
    if (!this.player) {
      await new Promise<void>((resolve, reject) => {
        this.player = new YT.Player(this.host, {
          width: '100%', height: '100%', videoId: target.videoId,
          playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: () => resolve(),
            onError: (e: { data: number }) => reject(new Error(`YouTube cannot play this video (error ${e.data})`)),
            onStateChange: (e: { data: number }) => { if (e.data === STATE.CUED) this.onCued?.(); },
          },
        });
      });
      return;
    }
    // cue (not load) so it does not autoplay; wait until YouTube confirms it is ready
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      this.onCued = () => { clearTimeout(t); this.onCued = undefined; resolve(); };
      this.player.cueVideoById(target.videoId);
    });
  }

  play() { this.player?.playVideo(); }
  pause() { this.player?.pauseVideo?.(); }
  seek(s: number) { this.player?.seekTo(s, true); }
  getTime() { return this.player?.getCurrentTime?.() ?? 0; }
  getDuration() { return this.player?.getDuration?.() ?? 0; }
  isPaused() {
    const s = this.player?.getPlayerState?.();
    return s !== STATE.PLAYING && s !== STATE.BUFFERING;
  }
  setRate() { /* intentionally a no-op, see canSetRate */ }
  destroy() { try { this.player?.destroy(); } catch { /* ignore */ } this.player = null; }
}

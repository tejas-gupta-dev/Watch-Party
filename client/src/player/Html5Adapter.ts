import type { LoadTarget, PlayerAdapter } from './PlayerAdapter';

/** <video> wrapper for uploaded movies and local files. */
export class Html5Adapter implements PlayerAdapter {
  readonly canSetRate = true;
  constructor(private readonly video: HTMLVideoElement) {}

  load(target: LoadTarget): Promise<void> {
    if (target.kind !== 'url') return Promise.reject(new Error('Html5Adapter needs a URL'));
    const v = this.video;
    return new Promise((resolve, reject) => {
      const cleanup = () => { v.removeEventListener('loadedmetadata', ok); v.removeEventListener('error', bad); };
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('This video could not be loaded')); };
      v.addEventListener('loadedmetadata', ok);
      v.addEventListener('error', bad);
      v.src = target.url;
      v.load();
    });
  }
  play() { return this.video.play(); }
  pause() { this.video.pause(); }
  seek(s: number) { this.video.currentTime = s; }
  getTime() { return this.video.currentTime; }
  getDuration() { return Number.isFinite(this.video.duration) ? this.video.duration : 0; }
  isPaused() { return this.video.paused; }
  setRate(r: number) { if (this.video.playbackRate !== r) this.video.playbackRate = r; }
  destroy() { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
}

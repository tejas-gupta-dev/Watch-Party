export type LoadTarget = { kind: 'youtube'; videoId: string } | { kind: 'url'; url: string };

/**
 * The only thing the sync logic knows about a player. VideoStage and useSyncedPlayer
 * work identically for YouTube and for an uploaded/local movie.
 */
export interface PlayerAdapter {
  /** true if playbackRate can be nudged finely (used for smooth drift correction) */
  readonly canSetRate: boolean;
  load(target: LoadTarget): Promise<void>;
  /** may reject (autoplay blocked); callers must handle it */
  play(): void | Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  getTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  setRate(rate: number): void;
  destroy(): void;
}

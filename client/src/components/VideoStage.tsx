import { useEffect, useRef, useState } from 'react';
import { canPerform, currentPosition } from '@watch-party/shared';
import { api } from '../api/http';
import { clock } from '../realtime/clockSync';
import type { RoomActions } from '../realtime/useRoomSocket';
import { useRoomStore } from '../store/roomStore';
import { Html5Adapter } from '../player/Html5Adapter';
import { YouTubeAdapter } from '../player/YouTubeAdapter';
import type { PlayerAdapter } from '../player/PlayerAdapter';
import { useSyncedPlayer } from '../player/useSyncedPlayer';
import { formatTime } from '../utils/format';

/** Hosts whichever player the current source needs and keeps it in sync with the room. */
export default function VideoStage({ actions }: { actions: RoomActions }) {
  const playback = useRoomStore((s) => s.playback);
  const me = useRoomStore((s) => s.me);
  const localFile = useRoomStore((s) => s.localFile);
  const reactions = useRoomStore((s) => s.reactions);
  const setLocalFile = useRoomStore((s) => s.setLocalFile);

  const ytHost = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const yt = useRef<YouTubeAdapter | null>(null);
  const h5 = useRef<Html5Adapter | null>(null);
  const adapterRef = useRef<PlayerAdapter | null>(null);

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  const source = playback.source;
  const key = source ? JSON.stringify(source) + (source.type === 'local' ? `:${localFile?.name ?? ''}` : '') : null;

  // (re)load whenever the source changes
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoadedKey(null);
    setError(null);
    yt.current?.pause();
    h5.current?.pause();
    if (!source || !key) { adapterRef.current = null; return; }

    (async () => {
      try {
        if (source.type === 'youtube') {
          yt.current ??= new YouTubeAdapter(ytHost.current!);
          adapterRef.current = yt.current;
          await yt.current.load({ kind: 'youtube', videoId: source.videoId });
        } else {
          h5.current ??= new Html5Adapter(videoEl.current!);
          adapterRef.current = h5.current;
          let url: string;
          if (source.type === 'file') {
            const media = await api.getMedia(source.mediaId);
            if (media.status !== 'ready' || !media.url) throw new Error(media.status === 'failed' ? 'This movie failed to process' : 'This movie is still processing');
            url = media.url;
          } else {
            if (!localFile) return; // waiting for this member to pick the file
            url = objectUrl = URL.createObjectURL(localFile);
          }
          await h5.current.load({ kind: 'url', url });
        }
        if (!cancelled) setLoadedKey(key);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();

    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => { yt.current?.destroy(); h5.current?.destroy(); }, []);

  const { blocked, resume } = useSyncedPlayer(adapterRef, loadedKey, playback, actions.reportDrift);

  // progress display
  useEffect(() => {
    const id = setInterval(() => {
      const a = adapterRef.current;
      if (a && loadedKey) { setTime(a.getTime()); setDuration(a.getDuration()); }
    }, 500);
    return () => clearInterval(id);
  }, [loadedKey]);

  const serverPos = () => currentPosition(playback, clock.now());
  const direct = canPerform(me?.role, 'play');
  const isYouTube = source?.type === 'youtube';
  const needsLocalFile = source?.type === 'local' && !localFile;
  const wrongFile = source?.type === 'local' && localFile && (localFile.name !== source.filename || localFile.size !== source.size);
  const shown = scrub ?? time;

  return (
    <div className="stage">
      <div className="screen">
        <div ref={ytHost} className="yt" style={{ display: isYouTube ? 'block' : 'none' }} />
        <video ref={videoEl} playsInline preload="auto" style={{ display: source && !isYouTube ? 'block' : 'none' }} />
        {isYouTube && <div className="yt-shield" />}

        {!source && (
          <div className="overlay"><p className="big">The screen is dark.</p><p className="muted">{direct ? 'Pick a video below to start the show.' : 'Waiting for the host to pick a video.'}</p></div>
        )}
        {needsLocalFile && source?.type === 'local' && (
          <div className="overlay">
            <p className="big">Open the same file</p>
            <p className="muted">Everyone plays their own copy of <strong>{source.filename}</strong>. Nothing is uploaded.</p>
            <label className="btn primary">Choose file<input type="file" accept="video/*" hidden onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)} /></label>
          </div>
        )}
        {wrongFile && <div className="overlay top"><p className="warn">This file differs from the host's ({source?.type === 'local' && source.filename}). Sync may look off.</p></div>}
        {error && <div className="overlay"><p className="error">{error}</p></div>}
        {blocked && !error && (
          <button className="overlay click" onClick={() => void resume()}>
            <span className="big">Click to join the playback</span>
            <span className="muted">Your browser blocked autoplay.</span>
          </button>
        )}
        <div className="float-layer" aria-hidden>
          {reactions.map((r, i) => <span key={r.id} className="float" style={{ left: `${8 + ((i * 17) % 80)}%` }} title={r.username}>{r.emoji}</span>)}
        </div>
      </div>

      <div className="controls">
        <button className="ctl" disabled={!source} onClick={() => actions.control({ type: 'seek', position: Math.max(0, serverPos() - 10) })} aria-label="Back 10 seconds">−10</button>
        <button className="ctl main" disabled={!source} onClick={() => actions.control({ type: playback.playing ? 'pause' : 'play', position: serverPos() })}>
          {playback.playing ? 'Pause' : 'Play'}
        </button>
        <button className="ctl" disabled={!source} onClick={() => actions.control({ type: 'seek', position: serverPos() + 10 })} aria-label="Forward 10 seconds">+10</button>
        <span className="time">{formatTime(shown)}</span>
        <input
          className="seek" type="range" min={0} max={Math.max(duration, 1)} step={1} value={Math.min(shown, Math.max(duration, 1))}
          disabled={!source || !duration} aria-label="Seek"
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => { if (scrub !== null) actions.control({ type: 'seek', position: scrub }); setScrub(null); }}
          onKeyUp={() => { if (scrub !== null) actions.control({ type: 'seek', position: scrub }); setScrub(null); }}
        />
        <span className="time">{formatTime(duration)}</span>
      </div>
      {!direct && <p className="muted hint">Your play, pause and seek requests go to the host and moderators for approval.</p>}
    </div>
  );
}

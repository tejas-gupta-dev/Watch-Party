import { useState, type FormEvent } from 'react';
import { parseYouTubeId } from '@watch-party/shared';
import type { RoomActions } from '../realtime/useRoomSocket';
import { useRoomStore } from '../store/roomStore';
import UploadDialog from './UploadDialog';

type Tab = 'youtube' | 'upload' | 'local';

export default function SourcePicker({ actions }: { actions: RoomActions }) {
  const [tab, setTab] = useState<Tab>('youtube');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const setLocalFile = useRoomStore((s) => s.setLocalFile);

  function submitYouTube(e: FormEvent) {
    e.preventDefault();
    const videoId = parseYouTubeId(url);
    if (!videoId) return setError('That does not look like a YouTube link.');
    setError('');
    actions.control({ type: 'change_video', source: { type: 'youtube', videoId } });
    setUrl('');
  }

  function pickLocal(file: File | undefined) {
    if (!file) return;
    setLocalFile(file);
    actions.control({ type: 'change_video', source: { type: 'local', filename: file.name, size: file.size, title: file.name } });
  }

  return (
    <div className="panel picker">
      <div className="tabs" role="tablist">
        {([['youtube', 'YouTube link'], ['upload', 'Upload a movie'], ['local', 'Local file']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'youtube' && (
        <form className="row" onSubmit={submitYouTube}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube link" aria-label="YouTube link" />
          <button className="primary">Load video</button>
        </form>
      )}
      {tab === 'upload' && <UploadDialog onReady={(mediaId, filename) => actions.control({ type: 'change_video', source: { type: 'file', mediaId, title: filename } })} />}
      {tab === 'local' && (
        <div className="stack">
          <p className="muted">Everyone opens their own copy of the same file. Nothing is uploaded, so it works for big files.</p>
          <label className="btn">Choose a video file<input type="file" accept="video/*" hidden onChange={(e) => pickLocal(e.target.files?.[0])} /></label>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

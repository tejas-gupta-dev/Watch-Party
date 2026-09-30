import { useState } from 'react';
import { api } from '../api/http';
import { formatBytes } from '../utils/format';

type Phase = 'idle' | 'uploading' | 'processing' | 'done';

/** Browser -> presigned URL -> object storage (the file never passes through our servers). */
export default function UploadDialog({ onReady }: { onReady: (mediaId: string, filename: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  function put(url: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and that storage is reachable.'));
      xhr.send(file);
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(''); setProgress(0);
    try {
      if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
      setPhase('uploading');
      const { mediaId, uploadUrl } = await api.uploadUrl(file.name, file.type, file.size);
      await put(uploadUrl, file);
      let { status } = await api.completeUpload(mediaId);
      setPhase('processing');
      while (status === 'processing') {
        await new Promise((r) => setTimeout(r, 2000));
        status = (await api.getMedia(mediaId)).status;
      }
      if (status !== 'ready') throw new Error('Processing failed. Try another file.');
      setPhase('done');
      onReady(mediaId, file.name);
    } catch (e) {
      setPhase('idle');
      setError((e as Error).message);
    }
  }

  return (
    <div className="stack">
      {phase === 'idle' && (
        <>
          <p className="muted">Upload once and everyone in the room streams it. MP4 (H.264) plays everywhere.</p>
          <label className="btn">Choose a movie<input type="file" accept="video/*" hidden onChange={(e) => void upload(e.target.files?.[0])} /></label>
        </>
      )}
      {phase === 'uploading' && (<><progress value={progress} max={100} /><p className="muted">Uploading… {progress}%</p></>)}
      {phase === 'processing' && <p className="muted"><span className="pulse" /> Getting the movie ready…</p>}
      {phase === 'done' && <p className="muted">Ready. Loaded into the room.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">{phase === 'idle' && `Up to ${formatBytes(4 * 1024 ** 3)}.`}</p>
    </div>
  );
}

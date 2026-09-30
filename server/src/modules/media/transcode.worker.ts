import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { redis } from '../../config/redis';
import { transcodeEnabled } from '../../config/env';
import { logger } from '../../infra/logger';
import { getMedia, updateMedia } from './media.repo';
import { downloadTo, storageEnabled, uploadFrom } from './storage';

const QUEUE = 'media:transcode';

export async function enqueueTranscode(mediaId: string): Promise<void> {
  await redis.lpush(QUEUE, mediaId);
}

function ffmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // H.264 + AAC in a fast-start MP4 plays in every browser and can start before it fully downloads
    const p = spawn('ffmpeg', [
      '-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output,
    ], { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function processOne(mediaId: string): Promise<void> {
  const media = await getMedia(mediaId);
  if (!media) return;
  const dir = await mkdtemp(path.join(tmpdir(), 'wp-'));
  try {
    const input = path.join(dir, 'in');
    const output = path.join(dir, 'out.mp4');
    await downloadTo(media.key, input);
    await ffmpeg(input, output);
    const key = `processed/${media.id}.mp4`;
    await uploadFrom(output, key, 'video/mp4');
    await updateMedia(media.id, { status: 'ready', key, contentType: 'video/mp4' });
    logger.info({ mediaId }, 'transcode finished');
  } catch (err) {
    logger.error({ err, mediaId }, 'transcode failed');
    await updateMedia(mediaId, { status: 'failed' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Polls a Redis list. RPOP is atomic so several nodes can run this safely. */
export function startTranscodeWorker(): () => void {
  if (!transcodeEnabled || !storageEnabled) return () => undefined;
  let stopped = false;
  let busy = false;
  const timer = setInterval(async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const id = await redis.rpop(QUEUE);
      if (id) await processOne(id);
    } finally {
      busy = false;
    }
  }, 2000);
  logger.info('transcode worker started');
  return () => { stopped = true; clearInterval(timer); };
}

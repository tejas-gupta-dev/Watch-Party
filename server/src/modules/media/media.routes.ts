import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transcodeEnabled } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../auth/auth.middleware';
import { getMedia, insertMedia, updateMedia } from './media.repo';
import { objectExists, presignGet, presignPut, storageEnabled } from './storage';
import { enqueueTranscode } from './transcode.worker';

const MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB
const idParams = z.object({ id: z.string().min(1).max(64) });

export const mediaRouter = Router();
mediaRouter.use(requireAuth, (_req, _res, next) => {
  if (!storageEnabled) return next(new AppError('Uploads are not configured on this server', 501));
  next();
});

// 1) browser asks for a presigned URL and uploads straight to object storage
mediaRouter.post(
  '/upload-url',
  validate({
    body: z.object({
      filename: z.string().trim().min(1).max(200),
      contentType: z.string().regex(/^video\//, 'Only video files are allowed'),
      size: z.number().int().positive().max(MAX_BYTES),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = randomUUID();
      const safe = req.body.filename.replace(/[^\w.-]+/g, '_');
      const key = `uploads/${id}/${safe}`;
      await insertMedia({ id, ownerId: req.user!.id, key, filename: req.body.filename, contentType: req.body.contentType, status: 'uploading' });
      res.status(201).json({ mediaId: id, uploadUrl: await presignPut(key, req.body.contentType) });
    } catch (e) { next(e); }
  },
);

// 2) browser confirms the upload finished
mediaRouter.post('/:id/complete', validate({ params: idParams }), async (req, res, next) => {
  try {
    const media = await getMedia(req.params.id);
    if (!media || media.ownerId !== req.user!.id) throw new AppError('Upload not found', 404);
    if (!(await objectExists(media.key))) throw new AppError('The file has not finished uploading', 409);
    // Hook point: run a virus scan (e.g. ClamAV) here before marking the file ready.
    if (transcodeEnabled) {
      await updateMedia(media.id, { status: 'processing' });
      await enqueueTranscode(media.id);
      return void res.json({ mediaId: media.id, status: 'processing' });
    }
    await updateMedia(media.id, { status: 'ready' });
    res.json({ mediaId: media.id, status: 'ready' });
  } catch (e) { next(e); }
});

// 3) any signed-in member can fetch a short-lived streaming URL
mediaRouter.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const media = await getMedia(req.params.id);
    if (!media) throw new AppError('Movie not found', 404);
    res.json({
      id: media.id,
      filename: media.filename,
      status: media.status,
      url: media.status === 'ready' ? await presignGet(media.key) : null,
    });
  } catch (e) { next(e); }
});

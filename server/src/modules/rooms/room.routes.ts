import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { requireAuth } from '../auth/auth.middleware';
import { createRoom, getRoomRecord } from './room.service';

export const roomRouter = Router();
roomRouter.use(requireAuth);

roomRouter.post('/', validate({ body: z.object({ name: z.string().trim().max(60).optional() }) }), async (req, res, next) => {
  try {
    const room = await createRoom(req.user!.id, req.body.name);
    res.status(201).json({ code: room.code, name: room.name });
  } catch (e) { next(e); }
});

roomRouter.get('/:code', validate({ params: z.object({ code: z.string().trim().min(4).max(12) }) }), async (req, res, next) => {
  try {
    const room = await getRoomRecord(req.params.code);
    if (!room) throw new AppError('No room with that code', 404);
    res.json({ code: room.code, name: room.name });
  } catch (e) { next(e); }
});

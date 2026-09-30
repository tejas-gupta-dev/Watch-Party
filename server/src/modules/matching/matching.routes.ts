import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { joinQueue, leaveQueue, matchStatus } from './matching.service';

export const matchingRouter = Router();
matchingRouter.use(requireAuth);

matchingRouter.post('/join', async (req, res, next) => {
  try { await joinQueue({ id: req.user!.id, username: req.user!.username }); res.json(await matchStatus(req.user!.id)); } catch (e) { next(e); }
});
matchingRouter.post('/leave', async (req, res, next) => {
  try { await leaveQueue(req.user!.id); res.json({ status: 'idle' }); } catch (e) { next(e); }
});
matchingRouter.get('/status', async (req, res, next) => {
  try { res.json(await matchStatus(req.user!.id)); } catch (e) { next(e); }
});

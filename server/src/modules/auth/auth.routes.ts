import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimit';
import { requireAuth } from './auth.middleware';
import { createGuest, login, register } from './auth.service';

const username = z.string().trim().min(2).max(24).regex(/^[\w .-]+$/, 'Letters, numbers, spaces, _ . - only');
const credentials = z.object({ username, password: z.string().min(6).max(72) });

export const authRouter = Router();

authRouter.post('/guest', validate({ body: z.object({ username }) }), (req, res) => {
  res.json(createGuest(req.body.username));
});
authRouter.post('/register', authLimiter, validate({ body: credentials }), async (req, res, next) => {
  try { res.status(201).json(await register(req.body.username, req.body.password)); } catch (e) { next(e); }
});
authRouter.post('/login', authLimiter, validate({ body: credentials }), async (req, res, next) => {
  try { res.json(await login(req.body.username, req.body.password)); } catch (e) { next(e); }
});
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

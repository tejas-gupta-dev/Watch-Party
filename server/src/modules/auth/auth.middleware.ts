import type { RequestHandler } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { verifyToken, type AuthUser } from './auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AppError('Sign in first', 401));
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    next(new AppError('Session expired, sign in again', 401));
  }
};

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { estimateOneRm } from '@light-weight/domain';
import { exerciseRouter } from './routes/exercises.js';
import { syncRouter } from './routes/sync.js';
import { authRouter } from './routes/auth.js';
import { friendsRouter } from './routes/friends.js';
import { routineSharesRouter } from './routes/routine-shares.js';
import { apiErrorHandler, notFoundHandler } from './lib/api-error.js';
import { configuredOrigins, requireTrustedOrigin } from './lib/request-security.js';

export function createApp(): Express {
  const app = express();
  const origins = configuredOrigins();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token']
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return requireTrustedOrigin(req, res, next);
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/routine-shares', routineSharesRouter);
  app.use('/api/exercises', exerciseRouter);
  app.use('/api/sync', syncRouter);
  app.get('/api/demo/onerm', (req, res) => {
    const weight = Number(req.query.weight) || 100;
    const reps = Number(req.query.reps) || 5;
    res.json({ weight, reps, estimate: estimateOneRm(weight, reps) });
  });
  app.use(notFoundHandler);
  app.use(apiErrorHandler);
  return app;
}

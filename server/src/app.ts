import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { clerkMiddleware } from '@clerk/express';
import { requireAuth } from './auth/requireAuth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { leavesRouter } from './routes/leaves.js';
import { approvalsRouter } from './routes/approvals.js';
import { documentsRouter } from './routes/documents.js';
import { metaRouter } from './routes/meta.js';
import { teamRouter } from './routes/team.js';
import { connectDb } from './db.js';

export function createApp(options: { clientOrigin?: string; connect?: boolean } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: options.clientOrigin ?? 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'vista', time: new Date().toISOString() }));

  if (options.connect !== false) {
    app.use('/api', async (_req, _res, next) => {
      await connectDb();
      next();
    });
  }
  if (process.env.NODE_ENV !== 'test') app.use(clerkMiddleware());
  app.use('/api', requireAuth);
  app.use('/api', metaRouter);
  app.use('/api/leaves', leavesRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/team', teamRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That API route does not exist.' } });
  });
  app.use(errorHandler);
  return app;
}

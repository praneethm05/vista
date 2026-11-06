import { Router } from 'express';
import { LEAVE_TYPES, LONG_LEAVE_THRESHOLD_DAYS } from '../domain/leaveTypes.js';
import { requireRole } from '../auth/requireAuth.js';
import { getBalances } from '../services/balanceService.js';
import { recent } from '../services/auditService.js';

export const metaRouter = Router();

metaRouter.get('/me', async (req, res) => {
  res.json({ ...req.user!, balances: await getBalances(req.user!.id) });
});

metaRouter.get('/leave-types', (_req, res) => {
  res.json({ types: LEAVE_TYPES, longLeaveThresholdDays: LONG_LEAVE_THRESHOLD_DAYS });
});

metaRouter.get('/audit', requireRole('ADMIN'), async (_req, res) => {
  res.json(await recent());
});

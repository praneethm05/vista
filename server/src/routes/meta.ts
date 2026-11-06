import { Router } from 'express';
import { LEAVE_TYPES } from '../domain/leaveTypes.js';
import { getPolicy } from '../services/settingsService.js';
import { requireRole } from '../auth/requireAuth.js';
import { getBalances } from '../services/balanceService.js';
import { recent } from '../services/auditService.js';

export const metaRouter = Router();

metaRouter.get('/me', async (req, res) => {
  res.json({ ...req.user!, balances: await getBalances(req.user!.id) });
});

metaRouter.get('/leave-types', async (_req, res) => {
  const policy = await getPolicy();
  res.json({
    types: LEAVE_TYPES.map((t) => ({ ...t, quota: policy.quotas[t.code] ?? t.quota })),
    longLeaveThresholdDays: policy.longLeaveThresholdDays,
    cancelNoticeDays: policy.cancelNoticeDays,
  });
});

metaRouter.get('/audit', requireRole('ADMIN', 'SYSADMIN'), async (_req, res) => {
  res.json(await recent());
});

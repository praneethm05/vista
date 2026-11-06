import { Router } from 'express';
import { requireRole } from '../auth/requireAuth.js';
import { dashboard } from '../services/statsService.js';
import { getPolicy, settingsSchema, updatePolicy } from '../services/settingsService.js';

export const adminRouter = Router();

adminRouter.get('/stats', requireRole('MANAGER', 'ADMIN', 'SYSADMIN'), async (req, res) => {
  res.json(await dashboard(req.user!));
});

adminRouter.get('/settings', async (_req, res) => {
  res.json(await getPolicy());
});

adminRouter.put('/settings', requireRole('SYSADMIN'), async (req, res) => {
  res.json(await updatePolicy(req.user!, settingsSchema.parse(req.body)));
});

import { Router } from 'express';
import { requireRole } from '../auth/requireAuth.js';
import { dashboard } from '../services/statsService.js';
import { getPolicy, settingsSchema, updatePolicy } from '../services/settingsService.js';
import { changeOrg, orgChangeSchema } from '../services/orgService.js';
import { cancelInvite, createInvite, inviteSchema, listOpenInvites } from '../services/inviteService.js';

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

adminRouter.patch('/org/:id', requireRole('SYSADMIN'), async (req, res) => {
  res.json(await changeOrg(req.user!, String(req.params.id), orgChangeSchema.parse(req.body)));
});

adminRouter.get('/org/invites', requireRole('SYSADMIN'), async (_req, res) => {
  res.json(await listOpenInvites());
});

adminRouter.post('/org/invites', requireRole('SYSADMIN'), async (req, res) => {
  res.status(201).json(await createInvite(req.user!, inviteSchema.parse(req.body)));
});

adminRouter.delete('/org/invites/:id', requireRole('SYSADMIN'), async (req, res) => {
  res.json(await cancelInvite(req.user!, String(req.params.id)));
});

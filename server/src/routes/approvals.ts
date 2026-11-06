import { Router } from 'express';
import { requireRole } from '../auth/requireAuth.js';
import { actionSchema } from '../domain/schemas.js';
import * as approvals from '../services/approvalService.js';
import * as leaves from '../services/leaveService.js';
import type { LeaveRequestDoc } from '../models/LeaveRequest.js';

export const approvalsRouter = Router();
approvalsRouter.use(requireRole('MANAGER', 'ADMIN'));

approvalsRouter.get('/', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'pending';
  res.json(await approvals.queue(req.user!, scope));
});

approvalsRouter.get('/:id', async (req, res) => {
  const detail = await leaves.getDetail(req.user!, req.params.id);
  res.json({ ...detail, request: await approvals.withInsights(detail.request as LeaveRequestDoc) });
});

approvalsRouter.post('/:id/actions', async (req, res) => {
  const input = actionSchema.parse(req.body);
  res.json(await approvals.act(req.user!, req.params.id, input));
});

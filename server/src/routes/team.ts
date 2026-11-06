import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/requireAuth.js';
import * as team from '../services/teamService.js';

export const teamRouter = Router();

teamRouter.get('/managers', async (req, res) => {
  res.json(await team.searchManagers(String(req.query.q ?? '')));
});

teamRouter.get('/join-request', async (req, res) => {
  res.json(await team.myRequest(req.user!));
});

const joinSchema = z.object({
  managerId: z.string({ error: 'Choose your manager.' }).min(1, 'Choose your manager.'),
  message: z.string().trim().max(300, 'Keep the note under 300 characters.').optional().default(''),
});
teamRouter.post('/join-request', async (req, res) => {
  const input = joinSchema.parse(req.body);
  res.status(201).json(await team.requestToJoin(req.user!, input.managerId, input.message));
});

teamRouter.get('/requests', requireRole('MANAGER'), async (req, res) => {
  res.json(await team.inbox(req.user!));
});

const decisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT'], { error: 'Choose accept or reject.' }),
  comment: z.string().trim().max(300).optional().default(''),
});
teamRouter.post('/requests/:id/decision', requireRole('MANAGER'), async (req, res) => {
  const input = decisionSchema.parse(req.body);
  res.json(await team.decide(req.user!, String(req.params.id), input.decision, input.comment));
});

teamRouter.get('/members', requireRole('MANAGER', 'ADMIN', 'SYSADMIN'), async (req, res) => {
  res.json(req.user!.role !== 'MANAGER' ? await team.allUsers() : await team.myTeam(req.user!));
});

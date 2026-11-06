import { Router } from 'express';
import { createLeaveSchema, listQuerySchema, respondSchema } from '../domain/schemas.js';
import * as leaves from '../services/leaveService.js';

export const leavesRouter = Router();

leavesRouter.post('/', async (req, res) => {
  const input = createLeaveSchema.parse(req.body);
  res.status(201).json(await leaves.submit(req.user!, input));
});

leavesRouter.get('/mine', async (req, res) => {
  const { status } = listQuerySchema.parse(req.query);
  res.json(await leaves.listMine(req.user!, status));
});

leavesRouter.get('/:id', async (req, res) => {
  res.json(await leaves.getDetail(req.user!, req.params.id));
});

leavesRouter.post('/:id/cancel', async (req, res) => {
  res.json(await leaves.cancel(req.user!, req.params.id));
});

leavesRouter.post('/:id/respond', async (req, res) => {
  const input = respondSchema.parse(req.body);
  res.json(await leaves.respond(req.user!, req.params.id, input));
});

import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { forgetUser, toCurrentUser } from '../auth/requireAuth.js';
import { record } from '../services/auditService.js';

export const profileRouter = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name.').max(60),
  jobTitle: z.string().trim().min(2, 'Please enter your job title.').max(60),
  // Accept the ways people actually type numbers ("+91 98765 43210", "98765-43210"), store digits only.
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^((\+91)?[6-9]\d{9})?$/, 'Enter a valid Indian mobile number, e.g. +91 98765 43210.'))
    .default(''),
  location: z.string().trim().min(2, 'Please choose your work location.').max(60),
});

/** First-run profile (and later edits). Your own profile only; role and team are not editable here. */
profileRouter.patch('/me', async (req, res) => {
  const input = profileSchema.parse(req.body);
  const updated = await User.findOneAndUpdate({ clerkId: req.user!.id }, { $set: input }, { returnDocument: 'after' }).lean();
  forgetUser(req.user!.id);
  await record(req.user!, { action: 'PROFILE_UPDATED', meta: { fields: Object.keys(input) } });
  res.json(updated ? toCurrentUser(updated) : null);
});

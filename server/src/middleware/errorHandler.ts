import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../domain/errors.js';

/** One place that turns every error into the same friendly shape: { error: { code, message, fields? } }. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || 'body'] ??= issue.message;
    const first = err.issues[0]?.message ?? 'Some fields need attention.';
    return res.status(400).json({ error: { code: 'VALIDATION', message: first, fields } });
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: { code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooBig ? 'Files must be 4 MB or smaller.' : 'The upload failed. Please try again.' },
    });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again in a moment.' } });
}

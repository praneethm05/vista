import { Router } from 'express';
import multer from 'multer';
import * as documents from '../services/documentService.js';

export const documentsRouter = Router();
const uploadOne = multer({ storage: multer.memoryStorage(), limits: { fileSize: documents.MAX_BYTES } }).single('file');

documentsRouter.post('/', uploadOne, async (req, res) => {
  res.status(201).json(await documents.upload(req.user!, req.file));
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await documents.download(req.user!, req.params.id);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.data);
});

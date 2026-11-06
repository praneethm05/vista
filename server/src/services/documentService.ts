import { Types } from 'mongoose';
import { LeaveDocument } from '../models/Document.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { AppError, notFound } from '../domain/errors.js';
import type { CurrentUser } from '../auth/user.js';
import { record } from './auditService.js';

export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
// Vercel functions accept request bodies up to 4.5 MB, so files are capped at 4 MB.
export const MAX_BYTES = 4 * 1024 * 1024;

/** Identify a file by its magic bytes, not by its name or the browser's claim. */
export function sniffType(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export async function upload(user: CurrentUser, file: Express.Multer.File | undefined) {
  if (!file) throw new AppError('FILE_REQUIRED', 400, 'Please choose a file to upload.');
  if (!ALLOWED_MIME.includes(file.mimetype) || sniffType(file.buffer) !== file.mimetype) {
    // The browser's Content-Type is just a claim; the file's first bytes are the evidence.
    throw new AppError('UNSUPPORTED_FILE', 415, 'Only real PDF, PNG or JPG files are allowed.');
  }
  const doc = await LeaveDocument.create({
    ownerId: user.id,
    filename: file.originalname.slice(0, 120),
    mimeType: file.mimetype,
    size: file.size,
    data: file.buffer,
  });
  await record(user, { action: 'DOCUMENT_UPLOADED', meta: { documentId: doc.id, filename: doc.filename } });
  return { id: doc.id as string, filename: doc.filename, mimeType: doc.mimeType, size: doc.size };
}

/** Ensures every attached document exists and belongs to the employee attaching it. */
export async function assertOwned(user: CurrentUser, ids: string[]) {
  if (ids.length === 0) return;
  const count = await LeaveDocument.countDocuments({ _id: { $in: ids }, ownerId: user.id });
  if (count !== ids.length) {
    throw new AppError('INVALID_DOCUMENT', 400, 'One of the attached documents could not be found. Please upload it again.');
  }
}

export async function linkToRequest(ids: string[], requestId: Types.ObjectId) {
  if (ids.length === 0) return;
  await LeaveDocument.updateMany({ _id: { $in: ids } }, { $set: { requestId } });
}

/**
 * Readable by the owner, or by the manager / HOD of the request it is attached to.
 * Anyone else gets 404 (not 403) so we don't reveal that the id exists.
 */
export async function download(user: CurrentUser, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Document');
  const doc = await LeaveDocument.findById(id).select('+data');
  if (!doc) throw notFound('Document');
  if (doc.ownerId !== user.id) {
    const request = doc.requestId ? await LeaveRequest.findById(doc.requestId).lean() : null;
    const isApprover = request && (request.managerId === user.id || request.hodId === user.id);
    if (!isApprover) throw notFound('Document');
  }
  // Medical certificates are sensitive personal data (DPDP Act): every view is recorded.
  await record(user, { requestId: doc.requestId, action: 'DOCUMENT_VIEWED', meta: { documentId: doc.id, filename: doc.filename } });
  return doc;
}

export async function listMeta(ids: Types.ObjectId[]) {
  return LeaveDocument.find({ _id: { $in: ids } }).select('filename mimeType size createdAt').lean();
}

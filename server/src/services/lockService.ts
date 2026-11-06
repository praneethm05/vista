import { Schema, model } from 'mongoose';
import { AppError } from '../domain/errors.js';

/**
 * A tiny distributed lock in MongoDB: inserting the same _id twice fails (unique key),
 * so only one request per key gets through, across every server instance.
 * expireAt + TTL index clears a lock left behind by a crashed request.
 */
const lockSchema = new Schema({ _id: String, expireAt: { type: Date, expires: 0 } });
const Lock = model('Lock', lockSchema);

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    await Lock.create({ _id: key, expireAt: new Date(Date.now() + 10_000) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError('IN_PROGRESS', 409, 'We are already processing a request from you. Please wait a moment.');
    }
    throw err;
  }
  try {
    return await fn();
  } finally {
    await Lock.deleteOne({ _id: key });
  }
}

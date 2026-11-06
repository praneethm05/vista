import mongoose from 'mongoose';

let connection: Promise<typeof mongoose> | null = null;

/**
 * Connect once and reuse. On Vercel each warm function instance keeps this promise,
 * so we don't open a new Mongo connection per request.
 */
export function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is missing. Copy .env.example to .env and fill it in.');
  connection ??= mongoose.connect(uri, { dbName: 'vista', serverSelectionTimeoutMS: 10_000 }).catch((err) => {
    connection = null; // allow a retry on the next request
    throw err;
  });
  return connection;
}

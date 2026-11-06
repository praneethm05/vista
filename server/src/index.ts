import mongoose from 'mongoose';
import { loadEnv } from './config/env.js';
import { createApp } from './app.js';

const env = loadEnv();

await mongoose.connect(env.MONGODB_URI, { dbName: 'vista' });
console.log('✓ Connected to MongoDB');

createApp({ clientOrigin: env.CLIENT_ORIGIN }).listen(env.PORT, () => {
  console.log(`✓ Vista API on http://localhost:${env.PORT}`);
});

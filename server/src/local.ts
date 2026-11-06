// Local development entry: `npm run dev` / `npm start`.
import { loadEnv } from './config/env.js';
import { connectDb } from './db.js';
import { createApp } from './createApp.js';

const env = loadEnv();
await connectDb(env.MONGODB_URI);
console.log('✓ Connected to MongoDB');

createApp({ clientOrigin: env.CLIENT_ORIGIN }).listen(env.PORT, () => {
  console.log(`✓ Vista API on http://localhost:${env.PORT}`);
});

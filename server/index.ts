// Vercel entry: Vercel detects Express and runs this exported app as a serverless function.
// (Local development uses src/local.ts, which calls app.listen.)
import { createApp } from './src/app.js';

const app = createApp({ clientOrigin: process.env.CLIENT_ORIGIN });
export default app;

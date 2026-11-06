// Vercel entry: Vercel detects Express and runs this exported app as a serverless function.
// dist/app.js is the whole TypeScript server bundled into one file by esbuild at build time,
// so there is no TypeScript or module resolution at runtime. Local development uses src/local.ts.
import app from './dist/app.js';

export default app;

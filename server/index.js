// Vercel entry: Vercel detects Express from this file and runs the exported app as a function.
// The API itself is the TypeScript server bundled by esbuild into dist/app.js at build time.
// Local development uses src/local.ts instead.
import express from 'express';
import api from './dist/app.js';

const app = express();
app.use(api);

export default app;

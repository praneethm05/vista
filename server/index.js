// Vercel entry: Vercel detects Express from this file and runs the exported app as a function.
// The API itself is the TypeScript server bundled by esbuild into dist/app.js at build time.
// Local development uses src/local.ts instead.
import { readFileSync } from 'node:fs';
import express from 'express';
import api from './dist/app.js';

const app = express();

// Static files are served by Vercel's CDN, but "/" reaches this function first,
// so we return the React app's index.html for it (the SPA then handles routing).
// Registered BEFORE the API so the API's helmet CSP (script-src 'self') isn't applied
// to the page; that CSP would block Clerk's script from clerk.accounts.dev.
let indexHtml = null;
app.get('/', (_req, res) => {
  try {
    indexHtml ??= readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
    res.type('html').send(indexHtml);
  } catch {
    res.status(500).send('Vista UI not found in this deployment.');
  }
});

app.use(api);

export default app;

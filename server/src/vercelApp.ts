// Bundled by esbuild into dist/app.js for Vercel (see package.json "vercel-build").
import { createApp } from './createApp.js';

export default createApp({ clientOrigin: process.env.CLIENT_ORIGIN });

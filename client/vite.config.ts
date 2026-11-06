import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..', // read VITE_CLERK_PUBLISHABLE_KEY from the root .env
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});

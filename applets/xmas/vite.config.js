import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import { defineConfig } from 'vite';

const allowedHosts = Array.from(new Set([
  ...(process.env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  'localhost',
  '127.0.0.1'
]));

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '$shell': path.resolve('../../shared-shell/src')
    }
  },
  server: {
    allowedHosts
  }
});

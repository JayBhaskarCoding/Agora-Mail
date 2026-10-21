import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    /* The sandbox/agent preview proxies the dev server under a generated
       host. Accept it (and any custom deployment host) instead of failing
       with Vite's "Blocked request" 403. */
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

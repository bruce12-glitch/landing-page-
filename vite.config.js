import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    // @ts-ignore - allow all hosts for E2B preview (Vite 5.4+ checks Host header)
    allowedHosts: true,
    hmr: {
      host: 'localhost',
    },
    headers: {
      'X-Frame-Options': 'ALLOWALL',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    cors: true,
    // @ts-ignore
    allowedHosts: true,
    headers: {
      'X-Frame-Options': 'ALLOWALL',
    },
  },
});

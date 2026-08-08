import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
    // Vite 5.4+ host check - allow any e2b preview host
    // @ts-ignore
    allowedHosts: true,
    hmr: false,
    headers: {
      'X-Frame-Options': 'ALLOWALL',
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "frame-ancestors *",
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
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': "frame-ancestors *",
    },
  },
});

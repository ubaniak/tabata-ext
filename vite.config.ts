import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The extension loads pages from chrome-extension://<id>/, so asset paths
// must be relative. Everything in public/ (manifest, service worker) is
// copied into dist/ unchanged.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { sidepanel: 'sidepanel.html' },
    },
  },
});

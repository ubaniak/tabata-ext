import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The phone remote page, published to GitHub Pages. It shares src/ with the
// extension (engine, remote protocol, styles), so the root sits in remote/
// and reaches up for the rest.
export default defineConfig({
  root: 'remote',
  envDir: '..',
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: '../dist-remote',
    emptyOutDir: true,
  },
});

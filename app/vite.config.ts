import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → gli asset si risolvono con file:// nel pacchetto Electron.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});

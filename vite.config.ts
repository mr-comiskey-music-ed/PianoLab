import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    // Tone.js is big; keep it in its own file so the page itself loads fast on a Chromebook.
    rollupOptions: { output: { manualChunks: { tone: ['tone'] } } },
    chunkSizeWarningLimit: 800,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

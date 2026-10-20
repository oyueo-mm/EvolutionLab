import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // The app is served from https://oyueo-mm.github.io/EvolutionLab/ (GitHub Pages project site).
  // The same base is used by `dev` and `preview` so path problems show up locally, not only after deploy.
  base: '/EvolutionLab/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // Recharts dominates the main bundle; it is a single-page app, so one ~600 kB chunk is acceptable.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

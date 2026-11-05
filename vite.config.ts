import { defineConfig } from 'vitest/config';

// base relative : le site fonctionne dans un sous-dossier (/moose-race/) sur GitHub Pages.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'] },
});

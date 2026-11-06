import { defineConfig } from 'vitest/config';

// base relative : le site fonctionne dans un sous-dossier (/moose-race/) sur GitHub Pages.
// Identifiant de build : versionne le cache du service worker.
const buildId = Date.now().toString(36);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  base: './',
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { include: ['tests/**/*.test.ts'] },
});

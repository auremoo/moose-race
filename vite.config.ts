import { defineConfig } from 'vitest/config';

// base relative : le site fonctionne dans un sous-dossier (/moose-race/) sur GitHub Pages.
// Identifiant de build : versionne le cache du service worker.
const buildId = Date.now().toString(36);

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    // Three.js dans un fichier à part : il change rarement, le navigateur le garde en cache
    // quand seul le code du jeu est mis à jour.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: (id: string) => (/node_modules[\\/]three[\\/](build|src)[\\/]/.test(id) ? 'three' : null) }],
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});

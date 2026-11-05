# Panache — course d'orignaux

Jeu de course d'orignaux en 3D, au navigateur, en portrait sur mobile. Voir le cahier des charges.

**État : jalon 1 « boîte grise »** — 1 circuit, orignal provisoire pilotable, physique arcade, caméra poursuite, déploiement GitHub Pages.

## Jouer

- En ligne : https://auremoo.github.io/moose-race/ (après activation de Pages, voir plus bas)
- Tactile : pose le pouce sur la moitié basse de l'écran et glisse à gauche ou à droite. La course est automatique.
- Clavier : flèches ← → (ou A / D), Échap ou P pour la pause, R pour recommencer en pause.
- Débogage : ajouter `?debug` à l'adresse, ou cocher « Mode débogage » dans la pause.

## Développer

```bash
npm install
npm run dev        # serveur local, accessible depuis le téléphone sur le même Wi-Fi
npm test           # tests de la simulation, sans navigateur
npm run build      # vérification des types + build dans dist/
npm run track:report -- src/data/tracks/boucle-grise.json piste.svg   # rapport de piste
```

## Architecture

| Dossier | Rôle |
| --- | --- |
| `src/sim/` | Physique, piste, course, pilote automatique. Aucun accès au DOM ni à Three.js. Pas fixe 60 Hz, déterministe. |
| `src/input/` | Tactile et clavier → commandes abstraites. |
| `src/render/` | Scène Three.js, caméra poursuite, orignal provisoire ; lit la simulation et interpole. |
| `src/ui/` | HUD, pause, résultats, textes. |
| `src/meta/` | Réglages et records en `localStorage`. |
| `src/data/` | Équilibrage (`balance.json`), parcours, textes. Tous les chiffres réglables sont ici. |

### Modèle de pilotage

La direction commande une courbure. L'accélération latérale est plafonnée par `aLat × adhérence` :
au-delà, l'orignal élargit et frotte. L'accélération partage ce même budget (cercle de friction).
En virage stabilisé, la vitesse tend donc vers `sqrt(aLat × R)` : un rayon plus large passe plus vite,
sans bonus scripté (vérifié par `tests/sim.test.ts`).

## Activer GitHub Pages (une fois)

Dépôt → Settings → Pages → Build and deployment → Source : **GitHub Actions**.
Chaque push sur `main` lance ensuite les tests, le build et le déploiement.

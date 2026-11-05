# Panache — course d'orignaux

Jeu de course d'orignaux en 3D, au navigateur, en portrait sur mobile. Voir le cahier des charges.

**État : jalon 3 « peloton »** — 20 circuits, jusqu'à 10 bots, classement, contacts, 3 difficultés, pièces ; ligne de course, corde, glissade, galop, aspiration, surfaces, ligne idéale. Orignal provisoire.

## Jouer

- En ligne : https://auremoo.github.io/moose-race/ (après activation de Pages, voir plus bas)
- Tactile : pouce gauche sur le bas de l'écran, glisse à gauche ou à droite pour diriger ;
  pouce droit sur **Fonce** (accélérer) et **Freine**. Le pouce peut glisser d'un bouton à l'autre.
- **Galop** (bouton orange, Espace) : +22 % de vitesse, vide l'endurance (anneau du bouton) en 4 s, recharge en 8 s.
- **Glissade** : Freine en braquant fort à bonne vitesse (ou Maj). Courte, elle freine ; longue, elle charge un élan
  (gerbes bleues puis or) libéré au relâchement, de 0,5 à 1,5 s.
- **Corde** : passer sur le disque vert à l'intérieur du virage sans déraper donne +5 % pendant 1,5 s.
- **Ligne idéale** au sol : verte si ta vitesse permet encore le prochain virage, rouge s'il faut freiner. Désactivable.
- Clavier : ← → (ou A / D) pour diriger, ↑ (W) pour accélérer, ↓ (S) pour freiner, Espace galop, Maj glissade,
  Échap ou P pour la pause.
- Débogage : ajouter `?debug` à l'adresse, ou cocher « Mode débogage » dans la pause.
- Langue : français ou anglais, selon le téléphone par défaut, modifiable dans Réglages (écran d'accueil).
- Compteur : la vitesse affichée est ramenée à celle d'un vrai orignal (pointe ≈ 56 km/h, valeur
  la plus citée mais incertaine). Le jeu tourne en réalité plus vite pour le plaisir ; le facteur est dans
  `balance.json` (`hud.realTopKmh`).

## Développer

```bash
npm install
npm run dev        # serveur local, accessible depuis le téléphone sur le même Wi-Fi
npm test           # tests de la simulation, sans navigateur
npm run build      # vérification des types + build dans dist/
npm run track:report -- src/data/tracks/boucle-grise.json piste.svg   # rapport d'une piste
npm run balance -- 1000     # critères d'équilibrage du cahier (duels simulés sans rendu)
npm run tracks:gen -- planche.html   # régénère les 19 circuits décrits par segments + planche de contrôle
```

## Architecture

| Dossier | Rôle |
| --- | --- |
| `src/sim/` | Physique, piste, course, pilote automatique. Aucun accès au DOM ni à Three.js. Pas fixe 60 Hz, déterministe. |
| `src/input/` | Tactile et clavier → commandes abstraites. |
| `src/render/` | Scène Three.js, caméra poursuite, orignal provisoire ; lit la simulation et interpole. |
| `src/ui/` | HUD, pause, résultats, textes. |
| `src/meta/` | Réglages et records en `localStorage`. |
| `src/data/` | Équilibrage (`balance.json`), parcours, textes FR/EN. Tous les chiffres réglables sont ici. |

**Circuits** : 20, du plus facile (★) au plus corsé (★★★★★). 19 sont décrits par segments dans
`tools/track-gen.ts` (`S200` ligne droite, `R90@40` virage à droite de 90° et 40 m de rayon,
`CHL40@20` chicane, `ESL60@30` S, `W14` largeur). L'outil ferme la boucle, élargit les lignes droites
(zones de dépassement), refuse tout circuit qui se croise, puis mesure le tour au pilote automatique pour
fixer le nombre de tours (course d'environ 90 s). La Boucle grise est dessinée à la main.

Un parcours est une liste de points `[x, y]` ou `[x, y, largeur]` : la largeur du sentier varie le long du tracé
(lignes droites larges pour dépasser, passages étroits).

### Modèle de pilotage

La direction commande une courbure, sensible à la vitesse : direction à fond = `steerGripMargin` × l'adhérence
disponible (2 par défaut). À mi-course, le virage est propre ; à fond, l'orignal dérape et ralentit. L'accélération latérale est plafonnée par `aLat × adhérence` :
au-delà, l'orignal élargit et frotte. L'accélération partage ce même budget (cercle de friction).
En virage stabilisé, la vitesse tend donc vers `sqrt(aLat × R)` : un rayon plus large passe plus vite,
sans bonus scripté (vérifié par `tests/sim.test.ts`).

## Activer GitHub Pages (une fois)

Dépôt → Settings → Pages → Build and deployment → Source : **GitHub Actions**.
Chaque push sur `main` lance ensuite les tests, le build et le déploiement.

## Bots et difficulté

Les bots suivent la ligne de course avec une erreur propre à leur talent (bruit de trajectoire, virages
ratés), dépassent du côté libre, évitent les contacts et galopent dans les lignes droites. Ils obéissent à la
même physique que le joueur. Leur cote est calée sur la tienne : Facile −6, Moyen ±0, Difficile +4 (en dessous
de la cote des communs, leurs stats sont abaissées). Rattrapage léger (≤ 3 %) en Facile et Moyen, aucun en
Difficile. Facile ajoute une petite aide à la direction ; Difficile masque la ligne idéale.

Critères d'équilibrage mesurés par `npm run balance` (200 duels chacun) : expert contre moyen à cote égale
87 % (≥ 85 %), +10 de cote à pilotage égal 70,5 % (≤ 80 %), meilleur orignal à cote égale 60 % (≤ 60 %).

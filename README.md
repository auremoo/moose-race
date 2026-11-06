# Panache — course d'orignaux

Jeu de course d'orignaux en 3D, au navigateur, en portrait sur mobile. Voir le cahier des charges.

**État : jalons 1 à 8 (V1.0 hors test graphique Meshy)** — didacticiel, PWA, décors des 3 biomes, mode Ours et castors, collection de 20 orignaux (Enclos, Comptoir, niveaux, ravitaillement, fragments), 20 circuits, jusqu'à 10 bots, classement, contacts, 3 difficultés, pièces ; ligne de course, corde, glissade, galop, aspiration, surfaces, ligne idéale. Orignal provisoire.

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
npm run e2e        # tests de bout en bout (Playwright, téléphone émulé), après npm run build
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

Critères d'équilibrage du cahier mesurés par `npm run balance -- 1000` (1 000 duels simulés sans rendu) :

| Critère | Mesuré | Cible |
| --- | --- | --- |
| Expert contre moyen à cote égale | 93,7 % | ≥ 85 % |
| +10 de cote, pilotage identique | 71,2 % | ≤ 80 % |
| Meilleur orignal à cote égale (Ti-Gus) | 54 % | ≤ 60 % |
| Courses pour améliorer un Commun au niveau 10 | 33,8 en moyenne (30 à 39) | 25 à 40 |

## Collection et économie

- **Enclos** : les 20 orignaux, stats, niveau, cote ; Améliorer (+2 aux 5 stats par niveau, jusqu'au niveau 10), Choisir.
- **Comptoir** : ravitaillement à 300 pièces (chances affichées : Commun 60 %, Peu commun 27 %, Rare 10 %,
  Épique 2,5 %, Légendaire 0,5 % ; Rare ou mieux garanti tous les 10), achat direct (sauf les communs),
  fragments de panache donnés par les doublons, échangeables contre l'orignal de son choix.
- Coût d'un niveau : 55 × n × multiplicateur de rareté. **Écart assumé avec le cahier (60)** : avec 60, le
  joueur simulé mettait 42 à 45 courses pour améliorer un Commun ; avec 55, 33 à 39 (cible 25 à 40).
- Sauvegarde locale versionnée (schéma 2, migration depuis le schéma 1), export et import dans les Réglages.

## Mode Ours et castors

Ours noirs placés juste après les points de corde, sur la ligne idéale : un « ! » rouge apparaît 2 s avant
chaque passage (traversée, charge depuis le bas-côté) ; certains gardent une zone en patrouillant. Contact :
étourdissement selon la Robustesse, aucune élimination. Facile 2–3 ours lents, Moyen 4–5, Difficile 6–8 plus
rapides. Castors hors de la ligne idéale : en toucher un donne une aide (Coup de queue, Barrage, Hutte), d'autant
plus offensive que tu es loin au classement ; réapparition après 5 s. Bouton Castor (ou E) pour l'utiliser.
Les bots suivent les mêmes règles. Pièces +25 %. Tout est tiré avec la graine de la course (même comportement
en multijoueur).

**Bief** : sur 9 circuits (détectés automatiquement là où deux portions de piste passent à 20–50 m l'une de
l'autre), un canal d'eau signalé sert de raccourci. L'aide Bief l'ouvre 10 s : passer à son embouchure lance la
traversée à la nage (9 m/s, gain de piste plafonné à 130 m, environ 3 s), sans contact ni ours.

## Défi du jour

Carte sur l'accueil : circuit, mode, difficulté et graine tirés de la date, identiques pour tous les joueurs
le même jour (10 bots). Bonus de 100 pièces à la première arrivée du jour.

## Fantôme

À chaque record sur un circuit, la trajectoire est enregistrée (10 poses par seconde, stockée à part :
`panache.ghost.<circuit>`) et rejouée ensuite en orignal translucide. Désactivable dans les Réglages.

## Dénivelé

Profil de hauteur par circuit (`elevation` : hauteurs à des fractions du tour, interpolées en douceur). En montée
l'orignal ralentit, en descente il prend de l'élan (gravité atténuée). Le terrain, le décor, les objets et la
caméra suivent le relief. Fort dénivelé aux Lacs de Banff (30 m), montées à la Promenade des Glaciers et au Col
du Kicking Horse.

## Météo

Tirée de la graine de la course selon le biome (forêt : 30 % de pluie, 10 % de brouillard ; plaine : 20 % / 5 % ;
Rocheuses : 15 % / 20 % ; jamais de pluie sur la neige). Même graine, même météo pour tous.

- **Pluie** : sentier, herbe et racines perdent 15 % d'adhérence, la boue devient plus lourde ; ciel gris,
  traînées de pluie penchées par le vent, éclaboussures, bruit de pluie. Un tour est quelques pour cent plus lent.
- **Brouillard** : rendu seulement (on voit moins loin), aucune incidence sur la physique.
- Annonce au départ (« Pluie : sentier glissant »). Pour tester : `?meteo=pluie`, `?meteo=brouillard` ou `?meteo=clair`.

## Vent et racines

- **Vent de travers** (Crépuscule du Manitoba, et plus léger sur le Blé de Saskatchewan) : rafales régulières qui
  poussent les orignaux sur le côté, d'autant plus qu'ils vont vite ; indicateur « Vent » sous la mini-carte
  (flèche orientée par rapport à l'orignal, rouge pendant les rafales). Même vent pour tous (multijoueur).
- **Racines** (Sentiers d'Algonquin) : surface qui retire un peu d'adhérence et de vitesse.

## Décors

Trois biomes : **plaine** (champs de blé, silos et élévateurs à grain, peupliers ; ciel de crépuscule au
Manitoba), **forêt** (pins et érables rouges, lacs et canots, cabane à sucre), **Rocheuses** (sommets enneigés à
l'horizon, lacs turquoise, inukshuks ; neige sur les circuits enneigés). Sur chaque circuit : chevrons en entrée
de virage, repères de freinage 100 / 50 avant les virages serrés, panneaux « Attention orignaux ». Tout est
instancié et généré par le code (remplaçable par des modèles). Qualité auto-adaptative : la résolution de rendu
baisse sous 45 FPS et remonte au-dessus de 58 FPS ; le décor s'allège sous 30 FPS.

## Orignal vivant et son

- Allures : trot (paires diagonales) puis galop rotatif ; foulée calée sur la vitesse (pas de sabots qui patinent),
  inclinaison en virage, bois qui oscillent avec retard ; états attente (respiration), étourdi (étoiles),
  victoire (il se cabre), défaite (tête basse) ; gros yeux visibles à l'accueil.
- Robes, gabarits et accessoires (tuque, foulard, clochette) différents pour les 20 orignaux.
- Son synthétisé par Web Audio, sans fichier externe : sabots selon la surface, glissade qui monte avec l'élan,
  corde parfaite, élan, castor, ours, chocs, compte à rebours, bramé de victoire, musique légère par biome.
  Vibrations si le navigateur le permet. Réglages : bruitages, musique, vibrations, réduire les animations.

## Accueil

Les menus s'affichent devant un enclos dédié (scène à part de la course) : prairie, clôture de perches,
balles de foin, abreuvoir, cabane en rondins, forêt et sommets au loin. L'orignal actif y attend, la caméra
tourne doucement autour de lui.

## Niveaux de détail

Trois niveaux, selon la distance à la caméra :

- **Arbres** (instanciés) : complets à moins de 70 m ; sapins à 5 faces et tronc à 3 faces jusqu'à 200 m ;
  pyramides et octaèdres au-delà. Répartition refaite quand la caméra a bougé de 4 m.
- **Orignaux** (`THREE.LOD`) : complet et animé à moins de 40 m ; simplifié en un seul appel de dessin
  jusqu'à 120 m ; silhouette en boîtes au-delà. Désactivé quand un modèle GLB est fourni.

Mesure (Plaine, 11 orignaux, 25 s de course) : 43 900 → 32 000 triangles, appels de dessin quasi inchangés (73 → 77).

## Modèles 3D (GLB)

Chaque forme générée par le code peut être remplacée par un fichier GLB sans toucher à la simulation :
déposer le fichier dans `public/models/` et renseigner son chemin dans `src/data/models.json`
(`moose`, `bear`, `beaver`). Conventions pour l'orignal : orienté vers +x, environ 3 m de long, pieds à y = 0,
nœuds de pattes `leg_FL`, `leg_FR`, `leg_RL`, `leg_RR` (animés par le code), matériau `coat` teinté selon la robe.

## Habillage

- **Didacticiel** : première course guidée (Prairie tranquille, solo, Facile), mise en avant à la première visite,
  ignorable. Étapes : courir, diriger, freiner selon la ligne idéale, corde, galop, glissade.
- **PWA** : installable sur l'écran d'accueil (manifeste, icônes), jouable hors ligne après une première visite
  (service worker : réseau d'abord pour la page, cache pour les fichiers versionnés).
- Téléphone en paysage : invitation à repasser en portrait. Pause automatique et son coupé en arrière-plan.

# Panache — course d'orignaux (Moose Race en anglais)

Jeu de course d'orignaux en 3D, au navigateur, en portrait sur mobile. Voir le cahier des charges.

**État : jalons 1 à 8 (V1.0 hors test graphique Meshy)** — didacticiel, PWA, décors des 3 biomes, mode Ours et castors, collection de 20 orignaux (Enclos, Comptoir, niveaux, ravitaillement, fragments), 20 circuits, jusqu'à 10 bots, classement, contacts, 3 difficultés, pièces ; ligne de course, corde, galop, aspiration, surfaces, ligne idéale. Orignal provisoire.

## Jouer

- En ligne : https://auremoo.github.io/moose-race/ (après activation de Pages, voir plus bas)
- Tactile : pouce gauche sur le bas de l'écran, glisse à gauche ou à droite pour diriger ;
  pouce droit sur **Fonce** (accélérer) et **Freine**. Le pouce peut glisser d'un bouton à l'autre.
- **Galop** (bouton orange, Espace) : +22 % de vitesse, vide l'endurance (anneau du bouton) en 4 s, recharge en 8 s.
- **Pas de glissade volontaire.** Un virage pris trop vite fait élargir et ralentir ; **sous la pluie seulement**,
  l'orignal glisse vraiment (il ne garde que 55 % de son adhérence, l'arrière chasse, « Ça glisse »).
- **Corde** : passer sur le disque vert à l'intérieur du virage sans déraper donne +5 % pendant 1,5 s.
- **Ligne idéale** au sol : verte si ta vitesse permet encore le prochain virage, rouge s'il faut freiner. Désactivable.
- Clavier : ← → (ou A / D) pour diriger, ↑ (W) pour accélérer, ↓ (S) pour freiner, Espace galop,
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


Style : `npm run lint` (ESLint) et `npm run format` (Prettier, `format:check` en CI).
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
même physique que le joueur. Leur puissance est calée sur la tienne : Facile −6, Moyen ±0, Difficile +4 (en dessous
de la puissance des communs, leurs stats sont abaissées). Rattrapage léger (≤ 3 %) en Facile et Moyen, aucun en
Difficile. Facile ajoute une petite aide à la direction ; Difficile masque la ligne idéale.

Critères d'équilibrage du cahier mesurés par `npm run balance -- 1000` (1 000 duels simulés sans rendu) :

| Critère | Mesuré | Cible |
| --- | --- | --- |
| Expert contre moyen à puissance égale | 88,3 % | ≥ 85 % |
| +10 de puissance, pilotage identique | 68,3 % | ≤ 80 % |
| Meilleur orignal à puissance égale (Tempête) | 51,3 % | ≤ 60 % |
| Courses pour améliorer un Commun au niveau 10 | 28,1 en moyenne (coffres compris) | 25 à 40 |

## Collection et économie

- **Enclos** : les 20 orignaux, stats, niveau, puissance (moyenne des 5 stats) ; Améliorer (+2 aux 5 stats par niveau, jusqu'au niveau 10), Choisir.
- **Comptoir** : ravitaillement à 300 pièces (chances affichées : Commun 60 %, Peu commun 27 %, Rare 10 %,
  Épique 2,5 %, Légendaire 0,5 % ; Rare ou mieux garanti tous les 10), achat direct (sauf les communs),
  fragments de panache donnés par les doublons, échangeables contre l'orignal de son choix.
- Coût d'un niveau : 60 × n × multiplicateur de rareté (valeur du cahier). Un Commun se monte au niveau 10 en
  28 courses en moyenne (cible 25 à 40), coffres compris.
- Sauvegarde locale versionnée (schéma 2, migration depuis le schéma 1), export et import dans les Réglages.

## Accessoires

Cosmétiques, sans effet sur la course : 12 accessoires (tuques unies, rayée ou à carreaux, foulards, clochettes,
ceinture fléchée, ou rien). Les accessoires d'origine sont offerts. Les autres s'obtiennent de trois façons :
**objectif** (5 courses, 3 victoires, 3 défis du jour, 20 circuits gagnés…, progrès affiché au Comptoir),
**coffre**, ou **achat** au Comptoir (150 à 600 pièces). Dans l'Enclos, la fiche d'un orignal possédé permet de
changer ce qu'il porte, avec un aperçu 3D de l'orignal ; au Comptoir, un aperçu montre l'orignal actif avec
l'accessoire avant l'achat. L'accessoire suit en course, à l'accueil et au podium. Catalogue :
`src/data/accessories.json`.

## Coffres

Un podium (1er, 2e ou 3e, avec au moins un adversaire) rapporte un coffre ; le premier défi du jour terminé, un
coffre doré. Quatre emplacements sur l'accueil : s'ils sont pleins, le coffre est changé en pièces (le minimum
qu'il contient : 12, 30, 70 ou 150). Un toucher ouvre un coffre, tout de suite, sans attente ni coût.
**Jamais d'argent réel.** Contenu : pièces, fragments de panache et, selon le coffre, un accessoire pas encore
possédé (toujours dans l'aurore boréale). Plus la place est bonne, meilleur est le coffre en moyenne.
Réglages : `src/data/chests.json`.

L'équilibrage compte tous les coffres ouverts : ils font 12,3 % des pièces et un Commun se monte au
niveau 10 en 28,1 courses (critère du cahier : 25 à 40). Sauvegarde en schéma 4 (migration automatique).

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

## Ralenti de l'arrivée

Après une victoire ou un podium (course à plusieurs), les 2,5 dernières secondes sont rejouées à 40 % de la
vitesse, filmées depuis le bord de la ligne ; un toucher le passe. Ensuite viennent le podium et les résultats.
Désactivé avec « Animations réduites ».

## Photo-finish

Si le joueur franchit la ligne à moins de 0,3 s d'un rival, une caméra posée sur la ligne prend un cliché
de côté (sépia, fil rouge) à l'instant où le museau du joueur touche la ligne ; il s'affiche dans les résultats
avec l'écart (« Devant Solange de 0,08 s »). La course, elle, se juge au centre de l'orignal.

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

## Pilotage

- **Ligne idéale** : trajectoire de courbure minimale à 0,7 m du bord, vitesse visée calculée sur une
  courbure lissée sur ±10 m. Elle rougit (en tirets) seulement là où il faut ralentir, d'après l'orignal du
  joueur : plus de rouge au galop en ligne droite.
- **Herbe** : le bas-côté freine (l'orignal s'y enfonce, pleine résistance à 2 m du bord). Couper un virage par
  l'herbe ne paie plus (test sur 5 circuits ; avant, jusqu'à 5 s gagnées par tour). Les épingles serrées
  (rayon ≤ 18 m) ont un bas-côté de 2,5 m bordé de foin.
- **Départ parfait** : appuyer sur Fonce dans la dernière demi-seconde du compte à rebours donne 1 s d'élan ;
  trop tôt, rien. Les bots le réussissent selon leur talent.
- **Direction** : braquage complet en 0,14 s. Lignes de vitesse sur les bords à haute vitesse et au galop.

## Déblocage des circuits

Les 2 premiers circuits sont ouverts ; chaque suivant se débloque avec un **podium sur le précédent** (n'importe
quelle difficulté). Le **défi du jour** reste jouable sur n'importe quel circuit, même verrouillé (un podium au
défi du jour sur un circuit verrouillé ne débloque rien). Les circuits déjà gagnés avant cette règle restent
ouverts (sauvegarde en schéma 6).

## Difficulté et records

- Habileté des bots : Facile 0,15–0,40, Moyen 0,45–0,70, Difficile 0,80–0,96. Simulation de la première
  course (Prairie tranquille, Facile, 10 bots) : un joueur débutant (0,4) gagne 17 % du temps et monte sur le
  podium 43 % du temps ; un joueur correct (0,6), 60 % de victoires. Les nouveaux joueurs commencent en Facile.
- Records et fantômes liés à une empreinte du tracé : un circuit régénéré écarte automatiquement ses anciens
  records et son fantôme (message au démarrage). Sauvegarde en schéma 5.

## Chicanes

Deux virages serrés (≈ 64°, rayon ≈ 13 m) reliés par de courts bouts droits : la piste se décale d'environ
25 m, plus que sa largeur. Dans la chicane, le bas-côté ne fait que 1,5 m et une rangée de balles de foin marque
la barrière : impossible de la passer tout droit, ni par la piste ni par l'herbe (test sur les 16 circuits qui en
ont). Le générateur (`tools/track-gen.ts`) produit ces zones (`vergeZones`) automatiquement.

## Bifurcation (Automne en Mauricie)

Avant le virage du bas, à gauche de la carte, une branche étroite (7 m, racines sur 40 % de sa longueur) coupe
le coin intérieur : 149 m au lieu de 185 m. Pour la prendre, on sort sur le bas-côté du côté du panneau jaune
avant l'embranchement ; la ligne de course n'y passe jamais, on ne s'y retrouve donc pas par hasard. Gain
d'environ 0,4 s par tour en passage propre ; une touche de barrière ou une sortie dans l'herbe le fait perdre.
Les bots la tentent une fois sur cinq à une fois sur deux selon leur talent. Données : `fork` dans le JSON du
circuit (`from`, `to`, `width`, `surface`, `bend`, `zones`), code dans `src/sim/fork.ts`.

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

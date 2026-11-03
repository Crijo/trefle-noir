# Le Trèfle Noir — casino clandestin

Jeu de casino jouable dans le navigateur (mobile et PC), ambiance film noir des années 1950 avec touches de néon.
🎲 **Jouer en ligne : https://crijo.github.io/trefle-noir/**

**Argent entièrement fictif : aucun paiement, aucune mise réelle.**

Vous devez de l'argent à la Famille. À chaque manche, un mafieux annonce une dette et un délai, et vous verse une avance.
Gagnez assez au casino pour rembourser avant la fin du chrono. Si le temps tombe à zéro, ou si vous n'avez plus de quoi
miser le minimum, la partie est perdue et tout recommence à la manche 1.

Jeux : roulette européenne, blackjack, machine à sous 5 rouleaux, vidéo poker Jacks or Better.

## Lancer

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
```

```bash
npm run dev
```

Ouvrez l'adresse affichée (par défaut http://localhost:5173). Pour tester sur un téléphone du même réseau :
`npm run dev -- --host`, puis ouvrez l'adresse « Network » sur le téléphone.

## Tester

```bash
npm test
```

Tests unitaires (Vitest) des règles et des paiements de chaque jeu, du chrono, du portefeuille, du déroulé des manches
et de la sauvegarde. Les tests utilisent un générateur aléatoire à graine fixe (`SeededRng`) ou un sabot de cartes empilé.

```bash
npm run typecheck
```

## Simuler l'équilibrage (Monte-Carlo)

```bash
npm run sim
```

- 1 000 000 de coups par jeu : RTP, intervalle de confiance, écart-type, fréquence de gain, gain maximal ;
- taux de réussite des manches 1 à 6 avec plusieurs stratégies simples (20 000 manches par stratégie) ;
- écrit le rapport dans [`sim/results.md`](sim/results.md) et échoue (code 1) si un objectif de RTP n'est pas tenu.

`npm run sim:quick` fait la même chose en 100 000 coups pour itérer rapidement.

## Construire et déployer

```bash
npm run build
```

Le dossier `dist/` est un site statique : il se déploie tel quel sur n'importe quel hébergement statique
(GitHub Pages, Netlify, Cloudflare Pages, un serveur nginx…). Les chemins sont relatifs (`base: './'`), le jeu fonctionne
donc aussi dans un sous-dossier. `npm run preview` sert le build en local pour vérification.

**PWA** : le build génère un manifeste et un service worker (vite-plugin-pwa / Workbox). Après le premier chargement en
HTTPS (ou sur localhost), le jeu est installable (« Ajouter à l'écran d'accueil » / icône d'installation du navigateur)
et fonctionne hors ligne. Les icônes PNG sont générées depuis `public/favicon.svg` par `npm run icons`.

## Commandes

| Action | Tactile / souris | Clavier |
|---|---|---|
| Changer de jeu | onglets | `1` à `4` |
| Rembourser la dette | bouton « Rembourser » (toujours visible) | `P` |
| Couper le son | icône haut-parleur | `M` |
| Règles et raccourcis | icône `?` | `?` |
| Roulette | jeton, puis toucher les cases ; Lancer | `Espace` lancer, `⌫` annuler, `C` effacer, `R` remiser, `+`/`−` jeton |
| Blackjack | jetons, Distribuer, Tirer / Rester / Doubler / Séparer | `Espace`, `H`, `S`, `D`, `X` |
| Machine à sous | `−`/`+`, Lancer, Table des gains | `Espace`, `+`/`−`, `T` |
| Vidéo poker | toucher une carte pour la garder, Distribuer / Tirer | `Espace`, `Z X C V B` |

## Règles du chrono

- Le temps restant est calculé à partir d'une horloge monotone (`performance.now()`), jamais en comptant des images.
- Il continue pendant les parties et les animations ; on ne peut pas le mettre en pause pendant une manche.
- Seule exception : il s'arrête quand l'onglet ou l'application passe en arrière-plan, et repart au retour.
- Pendant les 30 dernières secondes : chrono rose clignotant, vignette rouge pulsée et bip chaque seconde (double bip sous 10 s).
- On ne peut pas rembourser pendant un coup en cours (main de blackjack, roue qui tourne…).

## Architecture

```
src/
  config/balance.ts     ← TOUS les paramètres d'équilibrage (manches, limites, règles, tables de gains, rouleaux)
  core/                 ← logique générale, sans DOM
    rng.ts              ← interface Rng : CryptoRng (jeu) et SeededRng (tests, simulation)
    rounds.ts           ← dette, avance, délai et limites de chaque manche
    run.ts              ← déroulé d'une partie : intro → jeu → remboursé / perdu
    timer.ts            ← compte à rebours fiable (horloge injectable pour les tests)
    wallet.ts           ← argent du joueur et mises « en jeu »
    storage.ts          ← meilleur score et réglages (localStorage)
  games/
    types.ts            ← contrat GameModule / GameView / GameContext
    registry.ts         ← liste des jeux (ajouter un jeu = une ligne)
    limits.ts           ← limites de table par manche
    <jeu>/logic.ts      ← règles pures et calcul des gains (testés, utilisés par la simulation)
    <jeu>/view.ts       ← interface du jeu (DOM, animations, sons)
  ui/                   ← application, HUD, écrans, modales, sons synthétisés, composants
  styles/main.css       ← direction artistique, responsive mobile d'abord
sim/                    ← simulation Monte-Carlo (réutilise exactement la logique des jeux)
tests/                  ← tests unitaires Vitest
```

La logique des jeux (`logic.ts`) n'importe jamais le DOM ; les vues ne recalculent jamais un gain. Le tirage
aléatoire est fait **avant** l'animation, qui ne fait que l'afficher.

### Ajouter un jeu

1. Écrire `src/games/<jeu>/logic.ts` (règles pures, `Rng` injecté) et ses tests.
2. Écrire `src/games/<jeu>/view.ts` qui exporte un `GameModule` : `create(ctx)` reçoit le portefeuille, le générateur,
   le son et un `AbortSignal` interrompu en fin de manche. Prélever la mise avec `ctx.wallet.take(id, montant)` et
   régler avec `ctx.wallet.settle(id, retour)`, puis appeler `ctx.changed()`.
3. Ajouter ses paramètres dans `config/balance.ts`, le module dans `registry.ts`, et un moteur dans `sim/engines.ts`.

## Équilibrage

Tous les jeux rendent entre 97 % et 99 % des mises (aucun n'est rentable sur la durée) ; ils se distinguent par leur
profil de risque :

| Jeu | Profil | RTP | Écart-type par coup |
|---|---|---|---|
| Blackjack (6 jeux, blackjack payé 6:5, croupier tire sur 17 souple) | faible : gains modestes et fréquents | ≈ 98,3 % (stratégie de base) | ≈ 1,1 mise |
| Roulette européenne | au choix : chances simples (faible), douzaines/colonnes (moyen), plein (élevé) | 97,3 % (exact) | 1,0 / 1,4 / 5,8 |
| Vidéo poker Jacks or Better 9/5 | moyen | ≈ 98,4 % (stratégie optimale) | ≈ 4,4 |
| Machine à sous 5×3, 10 lignes | élevé : gains rares mais jusqu'à plusieurs centaines de fois la mise | 97,33 % (calcul exact) | ≈ 7,2 |

Les manches deviennent plus difficiles : la dette augmente de 40 % par manche, l'avance de 30 % seulement, et le délai
baisse de 10 s (de 3 min à 2 min minimum). Les limites de table suivent la dette. Les résultats détaillés et les taux
de réussite par stratégie sont dans [`sim/results.md`](sim/results.md).

**Équité** : le hasard vient de `crypto.getRandomValues` avec échantillonnage par rejet (aucun biais de modulo).
Aucun tirage ne dépend de l'argent, du temps restant ou de la manche du joueur.

## Accessibilité

- Conçu d'abord pour le mobile (dès 360 px de large, en portrait, sans défilement horizontal), zones tactiles ≥ 44 px.
- Réglage **Animations** (écran d'accueil et aide `?`) : *Système* (par défaut, respecte `prefers-reduced-motion`),
  *Complètes* ou *Réduites*. Sous Windows, si « Effets d'animation » est désactivé, le mode Système réduit les
  animations : choisissez *Complètes* pour voir la roue et les rouleaux tourner. Pour les tests :
  `?motion=full` ou `?motion=reduce` dans l'adresse.
- Commandes entièrement utilisables au clavier ; annonces `aria-live` des résultats.
- Graphismes 100 % CSS/SVG, sons synthétisés (Web Audio) : aucune image ni son externe. Polices auto-hébergées.

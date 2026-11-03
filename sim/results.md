# Résultats de simulation

Graine 20261103 · 1 000 000 coups par jeu · 20 000 manches par stratégie et par manche.

## RTP et volatilité

| Jeu | Risque | RTP mesuré | IC 95 % | RTP théorique | Écart-type / coup (× mise) | Coups gagnants | Gain max (× mise) |
|---|---|---|---|---|---|---|---|
| Roulette – rouge/noir | faible | 97.35 % | ± 0.20 % | 97.30 % | 1.00 | 48.7 % | 2 |
| Roulette – douzaine | moyen | 97.28 % | ± 0.28 % | 97.30 % | 1.40 | 32.4 % | 3 |
| Roulette – numéro plein | élevé | 97.85 % | ± 1.15 % | 97.30 % | 5.85 | 2.7 % | 36 |
| Blackjack (stratégie de base) | faible | 98.30 % | ± 0.20 % | — | 1.14 | 43.3 % | 2 |
| Vidéo poker 9/5 (stratégie simple) | moyen | 97.93 % | ± 0.84 % | — | 4.28 | 23.9 % | 800 |
| Machine à sous 5×3, 10 lignes | élevé | 97.35 % | ± 1.41 % | 97.33 % | 7.20 | 17.3 % | 808 |

Écart entre le meilleur et le moins bon RTP : **1.00 %** (objectif ≤ 2 %).

Objectifs : RTP de chaque jeu dans [95 % ; 99 %] → ✅ · écart → ✅ · volatilité de 1.00 à 7.20 mise(s) par coup selon le profil de risque.

## Paramètres des manches

| Manche | Dette | Avance | Délai | Mise max roulette / blackjack / poker | Mise max machine à sous |
|---|---|---|---|---|---|
| 1 | 1000 $ | 650 $ | 180 s | 150 / 150 / 150 $ | 150 $ |
| 2 | 1400 $ | 850 $ | 170 s | 210 / 210 / 210 $ | 210 $ |
| 3 | 2000 $ | 1100 $ | 160 s | 290 / 290 / 290 $ | 290 $ |
| 4 | 2700 $ | 1400 $ | 150 s | 410 / 410 / 410 $ | 410 $ |
| 5 | 3800 $ | 1900 $ | 140 s | 580 / 580 / 580 $ | 580 $ |
| 6 | 5400 $ | 2400 $ | 130 s | 810 / 810 / 810 $ | 810 $ |

## Taux de réussite par manche (manche jouée seule, avec la seule avance)

| Stratégie | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|
| Rouge, mise max | 47.4 % | 47.0 % | 33.1 % | 30.7 % | 28.9 % | 28.3 % |
| Douzaine, mise max | 52.4 % | 51.4 % | 42.5 % | 38.9 % | 39.4 % | 36.6 % |
| Numéro plein, ¼ de la mise max | 43.8 % | 37.3 % | 34.9 % | 32.2 % | 30.1 % | 28.4 % |
| Blackjack, mise max | 45.6 % | 44.1 % | 34.1 % | 32.6 % | 27.2 % | 23.9 % |
| Blackjack, mise min (prudent) | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| Vidéo poker, mise max | 39.7 % | 37.8 % | 31.0 % | 28.7 % | 28.1 % | 26.6 % |
| Machine à sous, mise max | 18.4 % | 16.0 % | 14.7 % | 13.7 % | 13.3 % | 11.4 % |
| Machine à sous, ⅓ de la mise max | 28.4 % | 26.5 % | 26.4 % | 23.6 % | 23.2 % | 19.9 % |
| Adaptatif (douzaine, puis rouge pour la somme manquante) | 60.2 % | 55.4 % | 48.2 % | 44.9 % | 42.4 % | 38.6 % |

## Campagne : probabilité d'avoir remboursé les manches 1 à r d'affilée (argent restant reporté)

| Stratégie | ≤M1 | ≤M2 | ≤M3 | ≤M4 | ≤M5 | ≤M6 |
|---|---|---|---|---|---|---|
| Rouge, mise max | 47.1 % | 22.3 % | 10.3 % | 4.6 % | 1.3 % | 0.5 % |
| Douzaine, mise max | 52.8 % | 30.6 % | 17.4 % | 8.5 % | 4.1 % | 1.8 % |
| Numéro plein, ¼ de la mise max | 44.0 % | 27.4 % | 15.7 % | 8.0 % | 4.6 % | 2.0 % |
| Blackjack, mise max | 45.8 % | 24.1 % | 10.0 % | 4.1 % | 1.4 % | 0.5 % |
| Blackjack, mise min (prudent) | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| Vidéo poker, mise max | 39.1 % | 24.1 % | 12.7 % | 7.9 % | 3.8 % | 1.8 % |
| Machine à sous, mise max | 17.3 % | 11.3 % | 9.4 % | 7.1 % | 2.8 % | 1.7 % |
| Machine à sous, ⅓ de la mise max | 28.0 % | 19.3 % | 9.9 % | 5.6 % | 4.0 % | 2.6 % |
| Adaptatif (douzaine, puis rouge pour la somme manquante) | 60.0 % | 34.3 % | 17.4 % | 8.6 % | 4.0 % | 1.6 % |

Hypothèses de tempo (s/coup) : roulette 8, blackjack 11, slots 3.5, videoPoker 7. Paiement de la dette dès que l'argent suffit.

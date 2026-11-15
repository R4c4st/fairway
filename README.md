# Fly18 — golf entre potes (bêta)

PWA de golf entre copains : scores en direct, classements, GPS, Live, et le dernier paie sa tournée 🍺.
Nom : **Fly18** (ex-Fairway). URL : https://r4c4st.github.io/fairway/ · Back-end : Supabase (projet « Fairway »).

## Principes
- **Pureté et facilité** : rien qui surcharge. Toute nouveauté est montrée en aperçu avant publication.
- Fun : tournée du dernier, 🍺 « pas passé les rouges », pop-ups de beaux coups, bière animée en fin de partie.

## Fonctions (état au 15/11/2026)
- **Parties** : stroke play (par défaut), Stableford, match play, scramble (équipes de 2/4, tirage au sort / équilibrage), combo 9 scramble + 9 match play.
- **Index** : brut par défaut ; case « Prendre en compte les index » (WHS : handicap de jeu, coups reçus, handicap d'équipe 35/15 – 25/20/15/10).
- **Croix** en stroke play : par + 4 par défaut (réglable Profil, enregistrée dans chaque partie).
- **Joueurs** : tous les copains inscrits proposés (même hors ligne), invités sans appli, ajout en cours de partie. Un seul marqueur possible, saisie partagée en temps réel.
- **Invitations** : QR code, lien WhatsApp, code à 6 caractères, ou ajout direct d'un copain (la partie arrive sur son téléphone).
- **Temps réel** : scores, joueurs, beaux coups ; file d'attente hors réseau ; rafraîchissement au déverrouillage.
- **📺 Live** (mode spectateur), **👥 Suivre mes potes**, **🟢 En ligne** (point vert + parcours), **👥 Les copains** (inscrits, date d'inscription, dernière visite).
- **GPS** : distances avant/centre/arrière, suggestion de club (sac standard Driver → LW), mesure de coup, carte satellite, drapeaux auto (OpenStreetMap) ou placés à la main.
- **📍 Arrivée au golf** : bienvenue à l'ouverture de l'appli à < 2 km d'un parcours (1×/jour).
- **Affichage** : thème Auto / Clair / Sombre, couleur unique verte, logo au choix, texte agrandi (Aa), bandeau gazon.
- **Accueil** : météo d'ambiance animée (Open-Meteo), partie en cours en tête, historique compact, © Fly18 · by R4c4st.
- **🏆 Fly Tour** (opt-in) : une étape par mois (4 meilleurs 9 trous), Fly Cup au vainqueur, saison annuelle. Barème : trou en 1 +500, albatros +250, eagle +15, birdie +5, par +2, bogey −1, double −2, triple+ −3, croix −4, rouges −3, Nice shot reçu +2 / donné +1 (3 max, jamais à soi-même), participation +5 / 9 trous, victoire +5. Net si index renseigné.
- **Trophées**, **index estimé (WHS)**, **réactions** des spectateurs.
- **Profil** : code profil multi-appareils (fusionne les doublons), sauvegarde auto serveur, export JSON.
- **Partage** : carte de score en image, résultat texte.

## Supabase
Coller `schema.sql` en entier dans SQL Editor → Run (idempotent, relançable après chaque mise à jour).
Tables : courses, games (dont `teams`), players, scores, profiles (dont `created_at`, `season`), events (dont `by_name`), backups.

## Parcours
- UGOLF Grand Nancy-Pulnoy : par/HCP/distances par repère, SSS/slope (bleu/rouge SSS inconnu), notes trous 9/14/15.
- UGOLF Metz Technopole : slopes connus, SSS à compléter.
  Greens GPS : 2/18 trouvés via OpenStreetMap, le reste à placer (onglet Carte).

## Feuille de route
1. Test réel à Pulnoy (14/11/2026) → retours terrain.
2. Ajouter d'autres parcours.
3. Plus tard : sécurité/comptes et invitations, nom de domaine, appli Play Store (écran de démarrage intégré, gazon sous la barre d'état).
4. Idées en réserve : pronos entre potes, carte signée + vote du coup du jour, défi de la semaine, règle du jour, rewind d'après-partie.

## Abandonné
- Notifications push appli fermée (remplacées par le Live).
- Icônes de beaux coups sur la carte de score (surcharge).

# Fairway — golf entre potes

Appli web installable (PWA), dans le même esprit que Pen et SnapNote : scores trou par trou, calculs (Stableford, net, brut, match play), invitations, parties partagées en direct, distances GPS au green, parcours en mémoire avec les difficultés trou par trou.

## Mise en ligne (environ 15 min, à faire une seule fois)

### 1. GitHub Pages
1. Crée un repo `fairway` sur ton compte GitHub (r4c4st).
2. Mets-y tous les fichiers du dossier (le `README` et `schema.sql` peuvent rester, ils ne gênent pas).
3. Va dans Settings > Pages > Branch `main` / root > Save.
4. L'appli sera à l'adresse **https://r4c4st.github.io/fairway/**.

### 2. Supabase (le serveur temps réel, gratuit)
1. Crée un compte sur supabase.com, puis New project (région Europe, Francfort ou Paris).
2. Va dans **SQL Editor > New query**, colle tout le contenu de `schema.sql` et clique sur **Run**. Le script peut être relancé sans risque après une mise à jour.
3. Va dans **Project Settings > API** et copie :
   - le **Project URL** (https://xxxx.supabase.co) ;
   - la clé **anon public**.
4. Colle ces deux valeurs dans `config.js` (c'est valable pour tout le monde, donc tes potes n'auront rien à régler), puis pousse le fichier sur GitHub.
   Tu peux aussi les saisir dans l'appli : Profil > Serveur > Tester > Enregistrer.

> Le projet gratuit Supabase se met en pause après 7 jours sans activité. Si ça arrive, il suffit d'aller le relancer depuis le tableau de bord Supabase.

### 3. Sur le téléphone
Ouvre l'adresse dans Chrome (Android) ou Safari (iPhone), puis fais « Ajouter à l'écran d'accueil ». Accepte la localisation pour le GPS.

## Utilisation
- **Profil** : nom, index, repère habituel, distances de tes clubs (pour la suggestion de club).
- **Nouvelle partie** : parcours, repère, 18 trous / aller / retour, formule, date et heure de départ, joueurs.
- **📨 Inviter** : code à 6 caractères, QR code ou envoi WhatsApp. Le pote ouvre le lien, choisit « Je suis X » ou s'ajoute lui-même, et tout le monde voit les scores en direct.
- **Onglet Trou** : saisie des scores avec + / −, putts, X pour une balle ramassée. Tu vois les coups reçus (●) et les points. La distance au green (avant / centre / arrière) s'affiche avec le club suggéré, et « Mesurer mon coup » donne la longueur d'un coup.
- **Onglet Carte** : vue satellite. Touche la carte pour mesurer une distance (toi → cible → green). Avec les boutons Départ / Avant / Centre / Arrière, tu places les points du trou. Ça peut se faire depuis le canapé, et c'est partagé avec tous.
- **✏️ sur un trou** : note et difficulté de 1 à 5, partagées avec tous.
- **Classement / Carte de score** : brut, net, Stableford, état des duels en match play, putts, et partage du résultat.
- **Stats** : moyennes, meilleur score, évolution, moyenne par par 3, 4 et 5, répartition par/bogey/double.
- **Parcours** : ajout d'un golf (par, HCP, distances par repère, SSS/slope, notes).
- **Hors ligne** : sur le parcours sans réseau, les scores sont gardés sur le téléphone et envoyés dès que le réseau revient (badge en haut).

## Le côté fun 🍺
- **Fin de partie** : animation d'un verre de bière qui se remplit, avec « Merci (Nom) ! » pour le dernier, qui paie sa tournée. En cas d'égalité pour la dernière place, la tournée est partagée.
- **🍺 Rouges** : sur chaque joueur, à cocher quand son drive ne dépasse pas le départ rouge (pour ceux qui jouent des jaunes ou des blancs). Ça déclenche une pop-up pour tout le monde, et ça ajoute une tournée dans l'animation de fin.
- **👏 Signaler un beau coup** : tu choisis le joueur et le coup (birdie, eagle, gros drive, belle approche, putt de fou, chip-in…). La pop-up avec confettis s'affiche en direct sur le téléphone de tous les joueurs de la partie.
- Le **Classement** affiche les tournées en cours et les moments forts. Le bouton « Qui paie sa tournée ? » rejoue l'animation.

## Profil et partenaires
- À la première ouverture, chacun crée son profil (prénom, index, repère). Il est enregistré sur le serveur.
- Chaque profil a un **code** (Profil > Mon code). En cas de changement de téléphone, ce code permet de tout récupérer.
- Les **partenaires** sont mémorisés automatiquement : dans « Nouvelle partie », il suffit de les toucher pour les ajouter. Ceux qui ont l'appli (📱) voient la partie arriver directement sur leur téléphone, avec une pop-up d'invitation.

## Drapeaux automatiques
La position des greens est cherchée sur OpenStreetMap (trous, greens, drapeaux). Pour chaque trou, l'appli calcule le départ ainsi que l'avant, le centre et l'arrière du green. Ça se lance tout seul à la première ouverture d'un parcours sans GPS, ou via le bouton 🛰️ (onglet Carte ou fiche parcours). Si le golf n'est pas cartographié sur OpenStreetMap, il faut placer les greens à la main sur la carte satellite.

## Calculs
- Handicap de jeu (WHS/FFG) = index × slope / 113 + (SSS − par), arrondi. Sur 9 trous, on prend le demi-index et le demi-SSS.
- Les coups reçus sont répartis selon le HCP (SI) des trous joués.
- Stableford : 2 points pour un par net, 0 pour une balle ramassée.
- Brut/net : une balle ramassée compte comme un double bogey net.
- Match play : les coups rendus correspondent à la différence des handicaps de jeu, et chaque duel 1 contre 1 est calculé.

## À vérifier sur Nancy-Pulnoy
- Les par, HCP et distances viennent d'une carte de score trouvée en ligne. Vérifie avec celle du club, en particulier le **trou 9** (par 5 sur la carte en ligne).
- Le **SSS des repères bleu et rouge** n'était pas disponible. Sans lui, le par est utilisé à sa place.
- Les greens ne sont pas encore placés en GPS. Fais-le une fois sur la carte satellite et ce sera bon pour tout le monde.

## Sécurité
Il n'y a pas de comptes utilisateurs : quiconque possède l'URL du projet et la clé publique peut lire et écrire. C'est suffisant pour des scores entre potes, mais il ne faut rien y mettre de sensible.

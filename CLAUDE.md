# Kreative : consignes pour Claude

Ce fichier est lu automatiquement par Claude quand il ouvre ce dépôt. Il contient tout le contexte du portail Kreative et la façon de travailler avec Dario. **Aucun secret ne doit jamais être écrit ici : le dépôt est public.**

## 1. Avec qui tu travailles et comment lui répondre

- Dario, fondateur de l'agence Kreative (ads statiques pour Meta, pour des fondateurs et e-commerçants). Rôle admin dans le portail.
- Il écrit en français, vite, parfois à l'oral (dictée), avec des fautes : comprends l'intention. Réponds **en français**, court, concret.
- **Jamais de tiret long (—)** dans ce que tu écris pour lui (textes, interface, CGV...). Utilise « : », des virgules, ou des phrases séparées.
- Quand il doit cliquer quelque part (Framer, Cloudflare, Stripe, n8n), donne des étapes numérotées, avec le nom exact des boutons et l'endroit à l'écran. Il n'est pas développeur. S'il ne trouve pas, demande une capture d'écran plutôt que de deviner.
- Ne lui demande pas de « coller du code » si tu peux faire autrement. Ce qu'il peut faire seul : coller le Worker dans Cloudflare, régler Framer, Stripe et n8n en cliquant.
- Teste toujours avant de livrer (banc de test, section 9), et dis-lui ce que tu as vérifié et ce que tu n'as pas pu vérifier.
- Quand il s'énerve, ne te justifie pas longuement : reconnais l'erreur en une phrase et corrige.

## 2. Préférences de texte et de design (déjà tranchées, ne pas reproposer l'inverse)

- Valeurs vides : jamais un point « · » seul. Chiffres vides = « 0 », « 0 € », « 0 % » ; dates vides = « Aucune », « Pas encore », « Pas de date ».
- Panier : titre « Pack Starter » / « Pack Growth »... **tout en noir** (pas de mot en bleu), jamais « Commander Starter ». Sous-titre : « Ajoutez les options que vous souhaitez, puis passez commande. » (« souhaitez », pas « voulez »).
- Récap du panier : titre « Pack X ». Variations de texte : prix « +15 € par créa » (« +25 € » à 2 variations) dans l'option, total seulement dans le récap (« 2 variations de texte · 12 × 25 € »). Le « + » est grisé au maximum (2 variations).
- Prix par créative arrondi **vers le bas** comme sur le site (280/6 = 46 €, 490/12 = 40 €, 890/24 = 37 €).
- Paiement depuis le site : Stripe demande seulement email, nom, nom de l'entreprise (champs natifs Stripe `name_collection`) et la carte. Pas de téléphone, pas de site web, pas d'adresse complète. Dario a refusé les questions en plus.
- Stripe : titre de ligne « Pack X », description en points « • ». Ouverture dans un nouvel onglet, sans page de chargement.
- Logo et favicon : le K noir seul (pas dans un carré). DA du site : fond #F9F6F4, bleu #4D94FF, police Inter (version Display pour les titres), cartes blanches arrondies, boutons pilule bleus.
- Pages merci : pas d'étapes numérotées, petit rond bleu avec coche, texte : « Merci pour votre commande ! », puis le paiement reçu et l'espace créé, l'email envoyé avec le lien d'accès, « Connectez-vous pour remplir votre brief client. », trait #EBE5DF, « Erreur d'adresse : écrivez-nous sur WhatsApp. » (WhatsApp souligné).
- Livraisons : dossiers 1:1 / 4:5 / 9:16 **fermés** à l'ouverture partout.
- Bandeau « Vos créatives sont prêtes » : seulement le nom du projet (ex. « Pack Growth · octobre 2026 »).
- Espace designer en **anglais** (la designer est anglophone). Le reste en français.

## 3. Architecture

- **Site vitrine** : kreativeads.fr sur **Framer** (Claude n'y a pas accès : Dario fait les manipulations).
- **Portail** : app.kreativeads.fr = un **Cloudflare Worker** (`outils/cloudflare/worker.js`) qui sert les pages de ce dépôt (lues via l'API GitHub, cache ~20 s) et l'API.
  - Pages : `admin/`, `client/`, `strategiste/`, `designer/`, `commander/` (panier public), `merci/`, `fiche/`, `ui/` (app.js, app.css, review.js, panier.js, logos).
  - Une modification de page poussée sur `main` est en ligne en ~20 s. **Une modification de `worker.js` ne l'est pas** : copier le fichier pour Dario sous le nom « Worker Kreative vNN (a coller dans Cloudflare).js » ; il le colle dans Cloudflare puis Deploy. Dernière version donnée : **v65** (express : Starter et Growth en 24 h, Scale en 48 h, Custom = moitié du délai de chaque livraison, `heures` dans OPTIONS ; Custom en 4 livraisons dès 60 créas, `CUSTOM.lots` ; contient la v64 : Wimmov fait sa review comme les autres clients : la livraison approuvée ne termine le mois qu'à la 4e livraison, l'email de retours pointe vers `admin/wimmov.html` ; contient la v63 : Studio : les reels sans vues sont relus quel que soit leur âge ; un reel introuvable pour Instagram (« Unsupported get request… does not exist ») ne coûte qu'un appel et n'affiche plus d'alerte, l'alerte ne sort que si aucun reel ne se lit ; contient la v62 : Studio : la mise à jour des statistiques se limite à 40 appels à Instagram (25 dans le Cron), car Cloudflare gratuit coupe à 50 appels par passage (« Too many subrequests ») ; le reste est lu au passage suivant, rien n'est effacé ; contient la v61 : Studio : un reel dont Instagram refuse toutes les statistiques ne fait plus « refuser » toutes les métriques pour tous les reels (`metriques_ko_v` = 2, l'ancienne liste est oubliée), les statistiques connues ne sont jamais effacées, likes et commentaires lus avec la liste (`like_count`, `comments_count`), raison d'Instagram dans `compte.stats_erreur` ; contient la v60 : express du Custom à 490 € dès 70 créas : `par_volume` dans OPTIONS, `prixOption(o, pack, nb)` ; contient la v59 : Wimmov : le paiement libre de son espace s'appelle « Pack Custom » sur Stripe ; contient la v58 : Studio : « Retirer du Studio » sur un reel publié (`DELETE /api/studio/medias/:id`, `studio_medias.masque` = 1), et un reel archivé ou supprimé dans l'app Instagram se cache tout seul à la mise à jour (`masque` = 2, revient s'il est désarchivé ; jamais si Instagram ne renvoie rien ni plus de 10 d'un coup) ; contient la v57 : Studio : quand Meta bloque le compte (« API access blocked », code 200, token mort, trop d'appels : `bloqueIG`), les reels restent programmés et partent dès que c'est rétabli, ceux en retard de plus de 20 min un par passage ; les vidéos tombées en erreur pour ça repassent en programmé ; contient la v56 : variations de texte à la place des A/B tests : OPTIONS, `devis`, démo ; contient la v55 : icônes d'ordinateur `app-icon-admin-bureau-*` (tuile blanche à 95 %) et `app-icon-studio-bureau-*` (tuile noire à 100 %) : même taille à l'œil sur la barre des tâches sombre de Dario, ne pas les réduire davantage ; manifestes appelés en `?v=55` ; contient la v53 : app « Kreative Studio » installable sur studio.kreativeads.fr : `/manifest.webmanifest` et `/sw.js` publics sur cet hôte, icônes `app-icon-studio-*` = K blanc sur fond noir, arrondie sur ordinateur ; contient la v52 : le Studio Instagram, section 13 ; Cron : le déclencheur `*/5 * * * *` (facultatif) ne fait tourner que le Studio, les rappels restent sur `*/15` ; contient la v51 : icônes de l'app admin, pour Dario seulement : `app-icon-admin-192/512.png` = fond blanc arrondi pour Windows, `app-icon-admin-apple.png` et `-maskable.png` = K blanc sur fond noir pour le téléphone ; contient la v50 : app de l'admin installable : `/admin/manifest.webmanifest` « Kreative Admin » et `/admin/sw.js`, publics, sans cache ni notifications ; contient la v49 : Wimmov : l'espace créé par son lien Stripe est marqué `clients.special = 'wimmov'`, donc reconnu même payé avec une autre adresse que @wimmov.com ; contact toujours « Hugo Raffaelli » (`WIMMOV.contact`), l'email dit « Bonjour Hugo, » ; le lien Stripe ne demande pas le nom de la personne ; contient la v47 : client spécial Wimmov, section 12 ; le mois de 60 créas reste « en production » jusqu'à sa 4e livraison ; contient la v46 : la fiche créas envoyée depuis le portail passe par `/api/equipe/fiche` : le Worker ajoute le code Kreative, secret `CODE_FICHE` ; si la route ou le secret manque, la fiche repasse par l'ancien chemin et demande le code ; contient la v45 : options du client transmises à l'équipe dans `/api/equipe/etats`, démo avec options ; et la v44 : résiliation, verrou d'engagement Stripe, offre pour rester, notifications réécrites, rythme des briefs du Custom). La v44 a besoin d'un déclencheur Cron `*/15 * * * *` dans Cloudflare. Toujours lui rappeler que la nouvelle version contient les précédentes.
  - Base **D1** : clients, commandes, abonnements, livraisons, fichiers, commentaires, factures, retours, prod_etapes, push_abos, notifications, reglages, activite.
  - Fichiers livrés : **R2** (binding `FICHIERS`).
  - Secrets Cloudflare (jamais dans le code) : `ACCES` (équipe, `prenom=motdepasse:role`, rôles admin / strategiste / designer, séparés par des virgules), `CLE` (clé n8n), `GITHUB_TOKEN`, `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `N8N_EMAIL`, `CODE_FICHE` (le code Kreative que n8n attend pour une fiche créas).
- **n8n** : https://n8n.srv1536015.hstgr.cloud (section 7).
- **Fillout** : formulaires de brief (section 6).
- **Stripe** : compte « Kreative » (live). Webhook `https://app.kreativeads.fr/api/stripe/webhook`, événements checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, invoice.finalized, customer.subscription.updated, customer.subscription.deleted.

## 4. Parcours d'un client

1. Site : bouton Commander → page Framer `kreativeads.fr/commander/<pack>`. Elle contient le composant de code Framer **PanierKreative** (`outils/framer/PanierKreative.tsx`, réglages : Pack, Width Fill, Height Fit) qui affiche `app.kreativeads.fr/commander/<pack>` dans une iframe à la hauteur exacte du panier (la page envoie `postMessage({ kreativeHauteur })`). Ne pas revenir aux blocs Embed à hauteur fixe : défilement coincé sur iPhone.
2. Bouton Commander → `/payer/<pack>?creas=&options=` → session Stripe (fonction `sessionStripe`) au montant de `devis()`.
3. Succès → `https://kreativeads.fr/merci-<pack>?session_id={CHECKOUT_SESSION_ID}` (pages merci Framer). Annulation → `https://kreativeads.fr/commander/<pack>`.
4. Webhook → `paiementRecu` : crée le client (nom de l'entreprise = nom de l'espace, contact = nom de la personne) ou retrouve un client existant par id, client Stripe ou email ; crée la commande (pack lu dans les métadonnées, pas déduit du prix) ; envoie l'email d'accès via n8n (seulement pour un nouveau client).
5. Facture : `invoice_creation` activé (description = détail du pack et des options) ; `enregistrerFacture` la range dans l'espace client ; son numéro Stripe devient le numéro de commande.
6. Espace client : « Mon brief » (Fillout), suivi, créatives à valider et commenter, factures, commander (panier `ui/panier.js`, mêmes règles), app.
7. Client déjà connu de Stripe qui repaie : `customer` + `customer_update { name: auto, address: auto }` (sinon Stripe refuse à cause du numéro de TVA).

## 5. Prix (dans `worker.js` : PACKS, CUSTOM, OPTIONS ; `/api/offres` les expose)

- Starter 6 créas 280 € (48 h, 2 rounds de révision), Growth 12 créas 490 € (48 h), Scale 24 créas 890 € (72 h). Mensuel : 240 / 420 / 760 €.
- Custom : 30 à 100 créas par pas de 5 ; 35 € dès 30, 32 € dès 50, 29 € dès 75. Mensuel -15 %. Livré en plusieurs fois (comme n8n) : 1 livraison jusqu'à 30, 2 à 15 jours d'intervalle de 31 à 55, 4 (une par semaine) de 60 à 100 (depuis le 28/10/2026, `CUSTOM.lots`, n8n « Extract Data » du SUR MESURE : `nb_creas < 60`). Le délai vaut pour **chaque** livraison : 72 h jusqu'à 30, 96 h jusqu'à 50, 120 h jusqu'à 70, 168 h jusqu'à 100 (panier, CGV 2.1 et composant Framer `outils/framer/CGVKreative.tsx` alignés le 17/10/2026).
- Options : express (Starter et Growth livrés en 24 h, Scale en 48 h, Custom : délai de chaque livraison divisé par 2 ; texte de l'option calculé dans le panier) 90 / 190 / 290 / 390 € selon le pack, et 490 € pour un Custom de 70 créas ou plus (depuis le 27/10/2026, `par_volume`, CGV 2.2 et `CGVKreative.tsx` alignés) ; **Variations de texte** (depuis le 22/10/2026, remplacent les A/B tests visuel et texte, retirés de la vente) : sur **toutes** les créas, le même visuel avec 1 ou 2 textes en plus, 15 € par créa pour 1 variation, 25 € (15 + 10) pour 2, maximum 2. Option `variations:N` ; la fiche créas donne N+1 textes à chaque créa par défaut. Les anciennes commandes `ab_visuel` / `ab_texte` restent lisibles (équipe, fiche). CGV 2.2 mises à jour le 22/10/2026.
- Abonnement : engagement 3 mois. Bouton « Résilier l'abonnement » dans l'espace client (Mon profil seulement), actif dès que le 3e mois est débité (tous les packs) ; Stripe `cancel_at_period_end` : s'arrête à la fin du mois payé, jamais de 4e prélèvement forcé ; le client peut « Annuler ma résiliation » jusque-là (par défaut, l'abonnement continue tout seul). Verrou Stripe : une résiliation programmée avant la fin du 3e mois (tableau de bord Stripe…) est repoussée par le webhook à cette date (`cancel_at`) ; une annulation immédiate faite par Kreative reste possible. Avant de résilier : fenêtre « Êtes-vous sûr ? » avec l'offre pour rester = coupon Stripe d'ID `FIDELITE` créé par Dario (valeur et durée lues dans Stripe, appliqué sur l'abonnement via `discounts`, une seule fois par abonnement, `abonnements.offre_le`) ; sans ce coupon, la fenêtre s'affiche sans offre. La page de paiement Stripe affiche l'engagement (`custom_text.submit`). Pas de portail client Stripe configuré : ne pas en activer avec la résiliation. Table D1 `abonnements`. Le webhook Stripe doit aussi envoyer customer.subscription.updated et customer.subscription.deleted.
- CGV mises à jour le 17/10/2026 (prix, résiliation depuis l'espace client, article 3.2).

## 6. Formulaires Fillout

- Premier brief : starter `hSWiGFjTVhus`, growth `soMTps1WZmus`, scale `sPx62jwVQqus`, custom `oQN3qKRznVus` (sur `kreative-forms.fillout.com/t/`). Le portail ajoute `commande`, `client`, `email`, `marque`, et `creas` pour le Custom (n8n lit le nombre de créas dans `creas`). Dans Fillout, ces paramètres doivent exister comme champs cachés (URL parameters).
- Formulaire de retour `9pEDzM8K9Tus?dossier=…` : après chaque livraison d'un Custom livré en plusieurs fois (`brief_suivant`) ; chaque mois d'abonnement à partir du 2e mois (`brief_mois`). Le 1er mois d'un abonné passe par le brief complet du pack.
- n8n renvoie les réponses au portail : `POST /api/n8n/brief` et `/api/n8n/retour` (en-tête `X-Kreative-Cle`). Elles s'affichent dans « Mon brief ».
- **Notifications client (push de l'app + email), volontairement peu nombreuses, textes sobres et vouvoyés** (Dario a validé ce ton, pas de « en deux minutes », pas de familiarité) :
  1. Livraison : « Vos créatives sont prêtes » ; Custom en plusieurs fois : « Livraison 1 sur 4 disponible » ; retouches : « Vos créatives modifiées » (`envoyerAuClient`). Email : une seule phrase, « Si des ajustements sont nécessaires, indiquez-les directement sur les créatives concernées. » (pas de phrase sur les formats) ; retouches : « Les retouches demandées ont été appliquées. Si d'autres ajustements sont nécessaires, indiquez-les directement sur les créatives concernées, ou validez le projet en un clic. »
  2. Brief de la livraison suivante d'un Custom, **à sa date** (table `rappels`, `rappelsDus`, déclencheur Cron Cloudflare toutes les 15 min, secours `POST /api/n8n/rappels`) : rythme calé sur la date de commande, une période de 15 j (2 fois) ou 7 j (4 fois) par livraison ; le brief de la livraison n est demandé **à la fin de la période n-1, la veille** (commande + (n-1) × intervalle - 1 jour), jamais avant la livraison précédente, et **toujours dans un message à part, jamais avec une livraison** (au moins 1 h après) (`briefSuivantLe`). Un brief rempli en retard ne décale pas les suivants. Avant la date : l'espace affiche « vous sera demandé le … » (`brief_prochain`). Notification : « Faites-nous part de vos retours avant de lancer la prochaine livraison. » Email : « Faites-nous part de vos retours pour lancer la prochaine livraison. Dites-nous-en davantage sur ce qui a fonctionné dans la livraison précédente… »
  3. Nouveau mois d'abonnement payé : « Votre brief de novembre », « Faites-nous part de vos retours pour lancer la production de ce nouveau mois. » + email « Votre nouveau mois d'abonnement commence. » et bouton « Remplir mon brief » (`prevenirBriefDuMois`).
  Promos : seulement à la main par Dario (admin, bouton Notification). Ne pas ajouter d'autres notifications automatiques sans son accord. Le workflow n8n des emails est générique (`a`, `sujet`, `html`).

## 7. n8n (ne jamais afficher les clés qu'ils contiennent)

| Workflow | Id | Rôle |
|---|---|---|
| Scraping + Brief STARTER / GROWTH / SCALE | r9rrAjFrj2SxMReF / Pewzzze16MBnJ5bQ / L4HM7JGK49LFGQRZ | Brief Fillout → Moteur ; nœud « Prévenir le portail » |
| Scraping + Brief SUR MESURE | OC4wSqSnpUI5v4au | Webhook `brief-sur-mesure` ; créas lues dans `creas` ; découpe : ≤30 = 1 livraison, 31-55 = 2 (tous les 15 j), 60-100 = 4 (chaque semaine) ; dossiers `<D>_L1`, `_L2`... avec `livraison: { n, sur }` |
| Workflow · Moteur | P9ttwanE3ZNgE2tj | Dossier de production (trop gros pour une mise à jour par l'outil : Dario colle le code) |
| Workflow 2 · Génération des visuels (VISUELS) | ImBAVRuioJKgsXlR | Visuels IA (idem : pas de mise à jour par l'outil) |
| Kreative · Régénération | Nyp3mGqQQ5VvJ8VV | Refaire un visuel bugué (ne jamais le mettre à jour par l'outil) |
| Kreative · Retour client | kzNhdMGJrJpGEafD | Formulaire de retour → livraison suivante, prévient la stratégiste |
| Kreative · Emails du portail | OYW7Njxgd3Fsm26Q | Email du lien d'accès (secret `N8N_EMAIL` = son webhook) |
| Kreative · Livraison designer | 6kol8pLzJNIywN5H | Livraison depuis l'aperçu (lien Figma) |
| Kreative · Relances et suivi | l8p44j4TltPv9ePn | Rappels et alertes de deadline toutes les 15 min, point du matin |
| Kreative · Archivage mensuel | a8VhrZWI1N0mQHP9 | Retire les projets livrés du site le 1er du mois |
| Kreative · Coûts et soldes | jUi0tYs5WsglJlPN | Coût Anthropic + Gemini par commande, commandes Telegram |
| Kreative · Alertes de panne | dBhqXqvkTGmuzpcg | Workflow d'erreur : panne → Telegram |
| Kreative · lire une exécution (Claude) | xsEvttH2WpfLRNft | Lecture d'une exécution de VISUELS pour vérifier |

## 8. Règles de sécurité (non négociables)

- Ne jamais afficher, recopier ni demander un mot de passe, une clé API ou un secret dans la conversation. Dario les colle lui-même dans Cloudflare ou n8n. Pour un nouveau mot de passe d'équipe : il réécrit `ACCES` en entier (sa propre ligne comprise).
- Ne jamais lire un fichier local de mots de passe. Ne rien écrire de secret dans ce dépôt public ; flouter les vrais liens dans les captures.
- Certains nœuds n8n contiennent des clés (Gemini, clé n8n dans des URL, un code interne dans « Compter les envois » de VISUELS) : ne jamais les reproduire.
- n8n : une mise à jour par l'outil d'un workflow avec des nœuds HTTP GitHub efface leurs identifiants (Dario doit les remettre). Ne jamais tenter d'installer du code dans n8n par un canal automatique.
- Tests et démos : ne jamais déclencher de message Telegram.
- Ne pas créer de coupons ni de transactions sur le Stripe live : Dario le fait lui-même.
- Supprimer des données clients : demander d'abord (irréversible). Dans l'admin, le bouton « Supprimer le client » le fait.

## 9. Banc de test (`outils/tests/`)

- `bash outils/tests/tout.sh` : lance les ~610 tests (Worker dans Miniflare, faux GitHub, faux Stripe, faux n8n), chaque suite sur une base vide. `config-test.json` ne contient que des valeurs de test.
- `bash outils/tests/relance.sh` puis `node outils/tests/test_stripe.mjs outils/tests/config-test.json` pour une seule suite. Portail local : http://127.0.0.1:8787 (mot de passe de test `mdp-test-dario`).
- Ajouter un test pour chaque bug corrigé (ex. : client déjà connu de Stripe qui repaie).
- Pour les captures d'écran : Playwright est installé (Chromium dans /opt/pw-browsers). Le réseau sortant est filtré : kreativeads.fr et app.kreativeads.fr ne sont pas joignables depuis la machine de Claude.

## 10. Leçons apprises (pannes déjà rencontrées)

- Dario a déjà collé une mauvaise version du Worker : en cas de comportement bizarre, vérifier dans Stripe (`success_url` de la dernière session) quelle version tourne.
- Dans un bloc Embed Framer, la police de la page n'est pas transmise (rendu en Times) : charger Inter dans le bloc.
- Framer « Embed » = iframe à hauteur fixe → contenu coupé ou défilement coincé sur téléphone. Solution retenue : composant de code PanierKreative à hauteur automatique.
- Menu mobile : il se ferme par un voile cliquable, pas par un écouteur « une seule fois ».
- Un paiement test avec un email déjà client va dans ce compte et n'envoie pas d'email d'accès.
- Synchronisation : admin, stratégiste et designer lisent la même liste (`projets.json` + `/api/equipe/etats`, `K.prod`), relue toutes les 20 s, nouveaux projets compris ; l'espace client relit `/api/client/moi` toutes les 30 s. Une version de livraison de test se supprime dans l'admin (corbeille sur la page de la livraison).

## 11. Ouvert / à décider

- Test complet avec l'IA (brief → fiche → visuels) : MOTEUR, VISUELS et les briefs sont « Available in MCP ».

## 12. Wimmov (client spécial, uniquement lui)

- Hugo Raffaelli, wimmov.com. Reconnu par `estWimmov` : `special = 'wimmov'` ou email en **@wimmov.com** (l'espace = le client marqué, sinon le plus ancien @wimmov.com). Abonnement 1 200 €/mois pour 60 créas, livrées en 4 fois (une par semaine), payé par le lien Stripe « Pack ULTRA » (`plink_1UJxUZBaFgfyJZxjJCQHpo2g`, page de confirmation Stripe par défaut, pas de redirection, ne demande que l'entreprise). Pas d'engagement de 3 mois, pas de bouton Résilier : tout passe par Dario. **L'espace se crée tout seul au 1er paiement du lien**, quelle que soit l'adresse email (marqué `special = 'wimmov'`, puis tous les paiements du lien ou en @wimmov.com y arrivent) et Hugo reçoit son lien d'accès : pas besoin de « Nouveau client ». Hugo ajoute lui-même son media buyer (« Partager l'accès »).
- **Dario fait les créas et livre lui-même** depuis l'admin, menu Commercial → Wimmov (`admin/wimmov.html`) : Livrer → « Livraison N » → déposer les PNG → « Envoyer à Wimmov » (email à Hugo + adresses ajoutées, pas de n8n, pas de Telegram).
- **Invisible pour la stratégiste et la designer** : dossiers `WIMMOV_…` filtrés dans `/api/equipe/*`, `/etats` et les fichiers (404). Pas de brief Fillout, pas de fiche, pas de Telegram. Ne jamais le faire apparaître côté équipe.
- Espace client à part (`client/wimmov.html`, servi à la place de `client/index.html`) : créatives, « Retours de la semaine » (texte, liens, fichiers jusqu'à 95 Mo, pas de champ nom, tables D1 `wimmov_retours` / `wimmov_pieces`, email à Kreative), « Commander des créatives » (paiement unique : 6 = 180 €, 12 = 280 €, 24 = 490 €, Pack Sur mesure de 30 à 100 par 5 à 20 €/créa, liste déroulante), factures, review des créatives comme l'espace normal (commenter, approuver une par une, « Tout approuver », « Review terminée » ; Dario voit les retours dans `admin/wimmov.html`, puis « Nouvelle version »), « Partager l'accès » (le media buyer : même espace, reçoit aussi les emails ; réglage `wimmov`).
- Code : section Wimmov à la fin de `worker.js` + crochets gardés (`paiementWimmov` en tête de `paiementRecu`, renouvellement, verrou d'engagement, routes). Tests : `test_wimmov.mjs`, `test_wimmov_paiement.mjs`. Page Créatives comme l'espace normal : un tableau des livraisons, un clic ouvre la livraison (dossiers 1:1 / 4:5 / 9:16). Ne rien changer pour les autres clients.

## 13. Studio Instagram (studio.kreativeads.fr), pour Dario seulement

- Même Worker, reconnu par le nom d'hôte `studio.` (`estStudio`) ; page `studio/index.html` (aussi sur app.kreativeads.fr/studio/ pour l'admin). Rôle **admin** seulement (API `/api/studio/*`). Domaine ajouté dans Cloudflare : Worker → Settings → Domains & Routes → Custom domain `studio.kreativeads.fr`.
- Programmer des reels : vidéo MP4/MOV ≤ 95 Mo dans R2 (`studio/<id>`), servie publiquement à Instagram par `/_studio/video/<id>-<jeton>.mp4` (Range géré). Reel **normal** (`share_to_feed`) ou **d'essai** (`trial_params.graduation_strategy` MANUAL ou SS_PERFORMANCE ; le passage aux abonnés à la main se fait dans l'app, l'API ne le permet pas). Publication : conteneur → statut FINISHED → `media_publish` (`avancerStudio`), par le Cron et par la page ouverte (`/api/studio/avancer`). Répartition en lot (N par jour entre deux heures).
- Statistiques (`synchroStudio`, toutes les heures) : `/me`, `follower_count` par jour, tous les reels (`/media`), et par reel views, reach, likes, comments, shares, saved, total_interactions, ig_reels_avg_watch_time, follows, profile_visits ; une métrique refusée est retenue par type de publication (`metriques_ko`), oubliée chaque semaine. Formats (réglage `studio.formats`) attribués aux reels ; page Formats : score sur 100 = 50 % vues médianes, 30 % abonnés / 1 000 vues, 20 % partages + enregistrements / 1 000 vues. **Pas de suivi d'argent** (Dario : seulement ce qu'Instagram mesure).
- Connexion : app Meta « Kreative Studio » (cas d'usage Instagram, API setup with Instagram login), token généré dans Meta et collé par Dario dans Studio → Réglages ; gardé dans D1 (`reglages.studio`), jamais renvoyé à la page, prolongé tout seul après 20 jours (`refresh_access_token`). Tables D1 `studio_videos`, `studio_medias`, `studio_jours`. Les reels programmés directement dans l'app Instagram ou Meta Business Suite ne sont pas visibles par l'API (aucun outil ne les voit) ; supprimer dans le Studio = la vidéo ne part pas (un reel déjà publié reste sur Instagram). Tests : `test_studio.mjs` (faux Instagram sous `/ig/` dans fauxgithub.mjs, `INSTAGRAM_API` ; `POST /ig/_bloquer on=1` simule « API access blocked »). Instagram (connexion Instagram Login) ne permet ni de supprimer, ni d'archiver, ni de modifier la légende d'un reel publié : seulement le retirer du Studio. Le Studio n'affiche que les reels publiés à partir du 23/10/2026 (`DEPUIS` dans `studio/index.html`, rien n'est effacé).


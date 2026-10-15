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
- Récap du panier : titre « Pack X ». Option A/B : prix « +15 € par créa » dans l'option, total seulement dans le récap. Pas de « sur 45 ». Le « + » est grisé au maximum ; les deux A/B ensemble ne dépassent jamais le nombre de créas.
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
  - Une modification de page poussée sur `main` est en ligne en ~20 s. **Une modification de `worker.js` ne l'est pas** : copier le fichier pour Dario sous le nom « Worker Kreative vNN (a coller dans Cloudflare).js » ; il le colle dans Cloudflare puis Deploy. Dernière version donnée : **v35**. Toujours lui rappeler que la nouvelle version contient les précédentes.
  - Base **D1** : clients, commandes, livraisons, fichiers, commentaires, factures, retours, prod_etapes, push_abos, notifications, reglages, activite.
  - Fichiers livrés : **R2** (binding `FICHIERS`).
  - Secrets Cloudflare (jamais dans le code) : `ACCES` (équipe, `prenom=motdepasse:role`, rôles admin / strategiste / designer, séparés par des virgules), `CLE` (clé n8n), `GITHUB_TOKEN`, `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `N8N_EMAIL`.
- **n8n** : https://n8n.srv1536015.hstgr.cloud (section 7).
- **Fillout** : formulaires de brief (section 6).
- **Stripe** : compte « Kreative » (live). Webhook `https://app.kreativeads.fr/api/stripe/webhook`, événements checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, invoice.finalized.

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
- Custom : 30 à 100 créas par pas de 5 ; 35 € dès 30, 32 € dès 50, 29 € dès 75. Mensuel -15 %. Délais du panier : 72 h jusqu'à 30, 96 h jusqu'à 50, 120 h jusqu'à 70, 168 h jusqu'à 100.
- Options : express (délai divisé par 2) 90 / 190 / 290 / 390 € selon le pack ; A/B test visuel 20 €/créa ; A/B test texte 15 €/créa.
- Abonnement : engagement 3 mois. Il n'existe **pas encore** de bouton « Résilier » dans l'espace client (les CGV disent : par email ; le portail dit « depuis votre espace » : à corriger ou à construire).
- CGV mises à jour le 15/10/2026 avec ces prix.

## 6. Formulaires Fillout

- Premier brief : starter `hSWiGFjTVhus`, growth `soMTps1WZmus`, scale `sPx62jwVQqus`, custom `oQN3qKRznVus` (sur `kreative-forms.fillout.com/t/`). Le portail ajoute `commande`, `client`, `email`, `marque`, et `creas` pour le Custom (n8n lit le nombre de créas dans `creas`). Dans Fillout, ces paramètres doivent exister comme champs cachés (URL parameters).
- Formulaire de retour `9pEDzM8K9Tus?dossier=…` : après chaque livraison d'un Custom livré en plusieurs fois (`brief_suivant`) ; chaque mois d'abonnement à partir du 2e mois (`brief_mois`). Le 1er mois d'un abonné passe par le brief complet du pack.
- n8n renvoie les réponses au portail : `POST /api/n8n/brief` et `/api/n8n/retour` (en-tête `X-Kreative-Cle`). Elles s'affichent dans « Mon brief ».

## 7. n8n (ne jamais afficher les clés qu'ils contiennent)

| Workflow | Id | Rôle |
|---|---|---|
| Scraping + Brief STARTER / GROWTH / SCALE | r9rrAjFrj2SxMReF / Pewzzze16MBnJ5bQ / L4HM7JGK49LFGQRZ | Brief Fillout → Moteur ; nœud « Prévenir le portail » |
| Scraping + Brief SUR MESURE | OC4wSqSnpUI5v4au | Webhook `brief-sur-mesure` ; créas lues dans `creas` ; découpe : ≤30 = 1 livraison, 31-60 = 2 (tous les 15 j), 61-100 = 4 (chaque semaine) ; dossiers `<D>_L1`, `_L2`... avec `livraison: { n, sur }` |
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

- `bash outils/tests/tout.sh` : lance les ~380 tests (Worker dans Miniflare, faux GitHub, faux Stripe, faux n8n), chaque suite sur une base vide. `config-test.json` ne contient que des valeurs de test.
- `bash outils/tests/relance.sh` puis `node outils/tests/test_stripe.mjs outils/tests/config-test.json` pour une seule suite. Portail local : http://127.0.0.1:8787 (mot de passe de test `mdp-test-dario`).
- Ajouter un test pour chaque bug corrigé (ex. : client déjà connu de Stripe qui repaie).
- Pour les captures d'écran : Playwright est installé (Chromium dans /opt/pw-browsers). Le réseau sortant est filtré : kreativeads.fr et app.kreativeads.fr ne sont pas joignables depuis la machine de Claude.

## 10. Leçons apprises (pannes déjà rencontrées)

- Dario a déjà collé une mauvaise version du Worker : en cas de comportement bizarre, vérifier dans Stripe (`success_url` de la dernière session) quelle version tourne.
- Dans un bloc Embed Framer, la police de la page n'est pas transmise (rendu en Times) : charger Inter dans le bloc.
- Framer « Embed » = iframe à hauteur fixe → contenu coupé ou défilement coincé sur téléphone. Solution retenue : composant de code PanierKreative à hauteur automatique.
- Menu mobile : il se ferme par un voile cliquable, pas par un écouteur « une seule fois ».
- Un paiement test avec un email déjà client va dans ce compte et n'envoie pas d'email d'accès.

## 11. Ouvert / à décider

- **Délais du Custom incohérents** : le panier et les CGV promettent 72 h à 7 jours selon le volume, alors que n8n découpe en 2 livraisons espacées de 15 jours (31-60 créas) ou 4 hebdomadaires (61-100). Dario doit choisir ; aligner ensuite le panier, les CGV et n8n.
- Ajouter le champ caché `creas` dans le formulaire Fillout Custom (sinon n8n compte 30 créas).
- Bouton « Résilier l'abonnement » dans l'espace client (ou corriger la phrase du portail).
- Test complet avec l'IA (brief → fiche → visuels) : MOTEUR, VISUELS et les briefs sont « Available in MCP ».
- Comptes de test Podmax et Attar à supprimer dans l'admin si ce n'est pas fait.

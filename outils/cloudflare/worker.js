// ============================================================
//  KREATIVE · ESPACE PRIVÉ (Cloudflare Worker)
//
//  Sert le site des dossiers depuis le dépôt GitHub privé
//  kreativeadsfr/kreative-dossiers, derrière un mot de passe.
//
//  - Une personne = un mot de passe (secret ACCES). Retirer sa ligne
//    lui coupe l'accès tout de suite.
//  - Connexion gardée 60 jours sur le navigateur.
//  - n8n lit les fichiers par /_n8n/<CLE>/chemin (secret CLE),
//    sans mot de passe et sans aucune modification du contenu.
//  - Les anciens liens https://kreativeadsfr.github.io/kreative-dossiers/
//    écrits dans les pages et les JSON sont réécrits vers ce site.
//
//  Secrets à créer dans Cloudflare (Settings → Variables and Secrets) :
//    GITHUB_TOKEN  jeton GitHub en lecture seule sur le dépôt
//    ACCES         une ligne par personne : nom=motdepasse
//    CLE           la clé de n8n (longue, aléatoire)
//  Aucun secret n'est écrit dans ce fichier.
// ============================================================

const DEPOT = 'kreativeadsfr/kreative-dossiers';
const BRANCHE = 'main';
const ANCIENS = [
  'https://kreativeadsfr.github.io/kreative-dossiers/',
  'https://raw.githubusercontent.com/kreativeadsfr/kreative-dossiers/main/'
];
const COOKIE = 'k_espace';
const DUREE_JOURS = 60;
const PUBLICS = /^\/(ui\/kreative\.css|ui\/(app|review|panier)\.(css|js)|ui\/logo-[a-z0-9-]+\.png|ui\/[a-z0-9-]+\.svg|favicon-\d+\.png|apple-touch-icon\.png|app-icon-[a-z0-9-]+\.png)$/;
const INTERDITS = /(^|\/)(\.git|\.github|outils)(\/|$)|\.\./;
const LIMITE_REECRITURE = 3 * 1024 * 1024;   // au-delà, le texte passe tel quel
const LIMITE_SCRIPT = 64 * 1024;              // scripts inline réécrits jusqu'à 64 ko

const TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  json: 'application/json; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', avif: 'image/avif',
  pdf: 'application/pdf', zip: 'application/zip', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'
};
const TEXTES = /^(text\/|application\/json|image\/svg)/;

export default {
  // toutes les 15 min (déclencheur Cron de Cloudflare) : les briefs des livraisons suivantes arrivés à leur date ;
  // le Studio (reels programmés) à chaque déclencheur, aussi celui de 5 min s'il existe (les rappels, eux, restent au quart d'heure)
  async scheduled(ev, env, ctx) {
    if (!ev || ev.cron !== '*/5 * * * *') ctx.waitUntil(rappelsDus(env).catch(() => {}));
    ctx.waitUntil(cronStudio(env).catch(() => {}));
  },
  async fetch(req, env, ctx) {
    try { return await traiter(req, env, ctx); }
    catch (e) { return new Response('Erreur : ' + (e && e.message || e), { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    finally { if (EN_FOND.size && ctx && ctx.waitUntil) ctx.waitUntil(Promise.allSettled([...EN_FOND])); }  // les copies revérifiées en fond vont au bout
  }
};

async function traiter(req, env, ctx) {
  const url = new URL(req.url);
  let chemin;
  try { chemin = decodeURIComponent(url.pathname); } catch (e) { return texte('Adresse invalide', 400); }

  // ---------- n8n : /_n8n/<CLE>/... ----------
  if (chemin.startsWith('/_n8n/')) {
    const reste = chemin.slice(6);
    const i = reste.indexOf('/');
    const cle = i < 0 ? reste : reste.slice(0, i);
    if (!env.CLE || !egal(cle, env.CLE)) return texte('Accès refusé', 403);
    const sous = i < 0 ? '' : reste.slice(i + 1);
    if (req.method !== 'GET' && req.method !== 'HEAD') return texte('Lecture seule', 405);
    if (sous.startsWith('_api/')) return apiGithub(sous.slice(5) + url.search, env);
    return servir(sous, env, ctx, { brut: true, origine: url.origin, req });
  }

  // ---------- la page de confirmation après un achat sur la landing (publique) ----------
  // Lien de paiement Stripe → « Après le paiement » → rediriger vers https://app.kreativeads.fr/merci
  // une page par pack : /merci-starter, /merci-growth, /merci-scale, /merci-custom (et /merci)
  if (/^\/merci(-(starter|growth|scale|custom))?\/?$/.test(chemin)) return servir('merci/index.html', env, ctx, { brut: false, origine: url.origin, req });
  // Le paiement depuis la landing, au montant exact, pour TOUS les packs (Custom compris) :
  //   https://app.kreativeads.fr/payer/custom?creas=45&options=express,variations:1
  //   https://app.kreativeads.fr/payer/growth   (formule=mensuel pour l'abonnement)
  // Le compte client est créé au paiement (webhook), puis la page /merci-<pack> s'affiche.
  // le panier public de la landing (« Voir les options », « Configurer mon pack ») et ses données
  if (/^\/commander\/(starter|growth|scale|custom)\/?$/.test(chemin)) return servir('commander/index.html', env, ctx, { brut: false, origine: url.origin, req });
  if (chemin === '/commander' || chemin === '/commander/') return redirection('/commander/growth' + url.search);
  if (chemin === '/api/offres' && req.method === 'GET')
    return new Response(JSON.stringify({ packs: PACKS, custom: CUSTOM, options: OPTIONS, paiement: !!env.STRIPE_SECRET }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } });
  const pay = chemin.match(/^\/payer\/(starter|growth|scale|custom)\/?$/);
  if (pay && req.method === 'GET') {
    if (!env.STRIPE_SECRET) return redirection('https://kreativeads.fr/');
    const q = url.searchParams, opts = (q.get('options') || '').split(',').map(x => x.trim()).filter(Boolean);
    const d = devis(pay[1], q.get('formule') === 'mensuel' ? 'mensuel' : 'unique', Number(q.get('creas') || q.get('nb')) || null, opts);
    // annulation : retour sur la page panier du site (kreativeads.fr/commander/<pack>), même depuis le bloc Embed de Framer
    const ref = req.headers.get('Referer') || '';
    const retour = ref.startsWith(url.origin + '/commander/') ? 'https://kreativeads.fr/commander/' + d.pack
      : /^https:\/\/([a-z0-9-]+\.)*kreativeads\.fr(\/|$)/.test(ref) ? ref : 'https://kreativeads.fr/';
    try {
      const sess = await appelStripe(env, 'checkout/sessions', sessionStripe(d, { succes: 'https://kreativeads.fr/merci-' + d.pack + '?session_id={CHECKOUT_SESSION_ID}', annule: retour }));
      return new Response(null, { status: 303, headers: { Location: sess.url, 'Cache-Control': 'no-store' } });
    } catch (e) { return texte('Le paiement n\'a pas pu s\'ouvrir. Réessayez dans un instant, ou écrivez-nous sur WhatsApp : 07 56 92 10 42.', 502); }
  }
  // ---------- connexion ----------
  if (chemin === '/_connexion') return connexion(req, env, url);
  // déconnexion : retour à la page de connexion de son espace (en anglais pour un designer)
  if (chemin === '/_deconnexion') {
    const avant = await session(req, env);
    const lieu = avant ? '/_connexion?suite=' + encodeURIComponent(ACCUEILS[avant.role]) : '/_connexion';
    return new Response(null, { status: 303, headers: {
      'Location': lieu, 'Cache-Control': 'no-store', 'Set-Cookie': COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
  }

  // ---------- le Studio Instagram (studio.kreativeads.fr), réservé à l'admin ----------
  const studio = await routerStudio(req, env, ctx, url, chemin);
  if (studio) return studio;

  // ---------- portail client et API (voir « PORTAIL » plus bas) ----------
  const portail = await routerPortail(req, env, ctx, url, chemin);
  if (portail) return portail;

  if (req.method !== 'GET' && req.method !== 'HEAD') return texte('Méthode non autorisée', 405);

  // ---------- fichiers publics (la page de connexion en a besoin) ----------
  if (PUBLICS.test(chemin)) return servir(chemin.slice(1), env, ctx, { brut: false, origine: url.origin, req });

  // ---------- tout le reste : connecté seulement ----------
  const page = /\.html?$|\/$/.test(chemin) || !/\.[a-z0-9]{1,5}$/i.test(chemin);
  const qui = await session(req, env);
  if (qui) vuEquipe(env, ctx, qui.nom);
  if (!qui) {
    if (page) return redirection('/_connexion?suite=' + encodeURIComponent(chemin + url.search));
    return texte('Connexion requise', 401);
  }

  // chacun arrive dans son espace
  const accueil = ACCUEILS[qui.role];
  if (chemin === '/' || chemin === '/index.html') return redirection(accueil);
  if (chemin === '/_moi') return json({ nom: qui.nom, role: qui.role, accueil });
  if (chemin === '/_admin/dossiers.json') {
    if (qui.role !== 'admin') return texte('Accès refusé', 403);
    return listeDossiers(env);
  }

  // chacun ne voit que ce qui le concerne
  if (!autorise(qui.role, chemin)) {
    if (page) return redirection(accueil);
    return texte('Accès refusé', 403);
  }
  if (chemin === '/_telecharger') return telechargerFichier(url);
  if (req.headers.get('Sec-Fetch-Dest') === 'document' && !url.searchParams.has('integre')) {
    const route = routePortail(chemin, url);
    if (route) return redirection(accueil + '#/' + route);
  }
  return servir(chemin.slice(1), env, ctx, { brut: false, origine: url.origin, req, qui });
}

// télécharger une image du site du client (récupérée par le dossier) avec son nom :
// le navigateur refuse « download » sur une autre adresse, le Worker la relaie
async function telechargerFichier(url) {
  let cible;
  try { cible = new URL(url.searchParams.get('u') || ''); } catch (e) { return texte('Adresse invalide', 400); }
  if (!/^https?:$/.test(cible.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(cible.hostname) || /\.(local|internal)$/.test(cible.hostname)) return texte('Adresse refusée', 400);
  const nom = (url.searchParams.get('nom') || cible.pathname.split('/').pop() || 'fichier').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 80);
  let r;
  try { r = await fetch(cible.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (Kreative)' }, redirect: 'follow' }); } catch (e) { return texte('Le site ne répond pas', 502); }
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !/^(image|video)\//.test(type)) return texte('Ce lien ne mène pas à une image', 415);
  if (Number(r.headers.get('content-length') || 0) > 40e6) return texte('Fichier trop lourd', 413);
  return new Response(r.body, { headers: { 'Content-Type': type, 'Content-Disposition': 'attachment; filename="' + nom + '"', 'Cache-Control': 'private, max-age=3600' } });
}

// ============================================================
//  LES RÔLES
//    admin       : tout, plus le tableau de bord /admin/
//    strategiste : son espace, la fiche, les dossiers, les retours,
//                  l'aperçu des livraisons ; pas l'espace designer
//    designer    : son espace et l'aperçu / téléchargement de ses
//                  projets ; ni la fiche, ni les dossiers, ni les retours
// ============================================================
const ACCUEILS = { admin: '/admin/', strategiste: '/strategiste/', designer: '/designer/' };
// la designer voit aussi les créas d'inspiration de la fiche (où poser chaque texte d'une déclinaison)
const DESIGNER_OK = /^\/(designer\/.*|[A-Za-z0-9_-]+\/creas\/.*|fiche\/lot\d+\/refs\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)|projets\.json|[A-Za-z0-9_-]+\/(donnees|envois|livraison)\.json|signaler\.js|ui\/.*|favicon-\d+\.png|logo-kreative\.png)$/;
function autorise(role, chemin) {
  if (role === 'admin') return true;
  if (/^\/(admin|_admin|client|studio)(\/|$)/.test(chemin)) return false;
  if (role === 'designer') return DESIGNER_OK.test(chemin) || chemin === '/designer';
  if (role === 'strategiste') return !/^\/designer(\/|$)/.test(chemin);
  return false;
}

// la liste de tous les dossiers du dépôt (tableau de bord)
async function listeDossiers(env) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const r = await fetch(api + '/repos/' + DEPOT + '/contents/?ref=' + BRANCHE, { headers: {
    'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''), 'Accept': 'application/vnd.github+json',
    'User-Agent': 'kreative-espace', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!r.ok) return json({ erreur: r.status }, 502);
  const liste = (await r.json()).filter(x => x.type === 'dir' && /^[A-Z0-9][A-Za-z0-9_]+$/.test(x.name)).map(x => x.name);
  return json(liste);
}

function redirection(lieu) {
  return new Response(null, { status: 302, headers: { 'Location': lieu, 'Cache-Control': 'no-store' } });
}
function json(o, statut) {
  return new Response(JSON.stringify(o), { status: statut || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ============================================================
//  LIRE UN FICHIER DU DÉPÔT
// ============================================================
// La copie des fichiers du dépôt gardée par le Worker (v68). GitHub met souvent près d'une seconde à
// répondre : sans copie, chaque ouverture de page attendait GitHub pour la page, puis app.js, app.css,
// projets.json, donnees.json... l'une après l'autre. Maintenant : une copie de moins de « frais » ms est
// servie telle quelle ; plus vieille, elle est servie tout de suite et revérifiée en fond (GitHub répond
// « rien n'a changé » sans compter dans le quota, grâce à l'ETag) ; trop vieille (« max »), on attend GitHub.
// Une modification poussée sur main est donc vue à la 1re ouverture après ~20 s (au plus tard à la 2e).
// Mémoire de l'isolat + cache Cloudflare du centre (partagé entre isolats). Jamais pour n8n (lecture brute).
const COPIES = new Map();
const HTML_PRET = new Map();   // pages déjà réécrites (fichier + adresse du site → { id de la copie, html })
let DEPOT_TAILLE = 0;
const EN_FOND = new Set();   // revérifications lancées sans ctx : le gestionnaire fetch les attend après la réponse
function depotReponse(e, d) {
  if (e.flux) return new Response(e.flux.body, { status: 200, headers: { 'content-length': e.flux.headers.get('content-length') || '', 'x-copie': 'directe' } });
  return new Response(e.s === 200 ? e.b.slice(0) : 'Introuvable', { status: e.s, headers: e.s === 200 ? { 'content-length': String(e.b.byteLength), 'x-copie': d || '', 'x-copie-id': e.etag || '' } : { 'x-copie': d || '' } });
}
function depotGarder(fichier, e) {
  const ancien = COPIES.get(fichier);
  if (ancien && ancien.b) DEPOT_TAILLE -= ancien.b.byteLength;
  if (e.b && e.b.byteLength > 2e6) { COPIES.delete(fichier); return; }  // les gros fichiers : seulement dans le cache Cloudflare
  if (COPIES.size > 600 || DEPOT_TAILLE > 40e6) { COPIES.clear(); DEPOT_TAILLE = 0; }
  COPIES.set(fichier, e);
  if (e.b) DEPOT_TAILLE += e.b.byteLength;
}
// clé sur le domaine Kreative (le cache de Cloudflare ne garde que les adresses de la zone)
function depotCle(fichier) { return new Request('https://app.kreativeads.fr/_copie/' + encodeURI(fichier)); }
async function depotRelire(fichier, env, e) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const encode = fichier.split('/').map(encodeURIComponent).join('/');
  const h = { 'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''), 'Accept': 'application/vnd.github.raw', 'User-Agent': 'kreative-espace', 'X-GitHub-Api-Version': '2022-11-28' };
  if (e && e.etag) h['If-None-Match'] = e.etag;
  const r = await fetch(api + '/repos/' + DEPOT + '/contents/' + encode + '?ref=' + BRANCHE, { headers: h });
  const now = Date.now();
  let n;
  if (r.status === 304 && e) { if (r.body) r.body.cancel(); n = { ...e, lu: now }; }
  else if (r.ok && Number(r.headers.get('content-length') || 0) > 20e6) return { s: 200, flux: r, lu: now };  // très gros fichier : servi sans copie
  else if (r.ok) n = { s: 200, b: await r.arrayBuffer(), etag: r.headers.get('ETag') || '', lu: now };
  else if (r.status === 404) { if (r.body) r.body.cancel(); n = { s: 404, lu: now }; }
  else { if (r.body) r.body.cancel(); return e ? null : { s: r.status, lu: now, erreur: true }; }  // GitHub en panne : on garde la copie
  depotGarder(fichier, n);
  if (n.s === 200 && n.b.byteLength < 10e6) {
    try {
      await caches.default.put(depotCle(fichier), new Response(n.b.slice(0), { headers: { 'Cache-Control': 'max-age=86400', 'X-Lu': String(n.lu), 'X-Etag': n.etag } }));
    } catch (x) {}
  } else if (n.s === 404) { try { await caches.default.delete(depotCle(fichier)); } catch (x) {} }
  return n;
}
const DEPOT_EN_COURS = new Map();
function depotMaj(fichier, env, e) {
  if (!e) return depotRelire(fichier, env, e).catch(() => null);   // première lecture : chacun la sienne (un très gros fichier ne se partage pas)
  if (!DEPOT_EN_COURS.has(fichier)) DEPOT_EN_COURS.set(fichier, depotRelire(fichier, env, e).catch(() => null).finally(() => DEPOT_EN_COURS.delete(fichier)));
  return DEPOT_EN_COURS.get(fichier);
}
async function lireDepot(fichier, env, ctx, frais, max) {
  let e = COPIES.get(fichier), d = 'memoire';
  if (!e) {
    d = 'cache';
    try {
      const c = await caches.default.match(depotCle(fichier));
      if (c) { e = { s: 200, b: await c.arrayBuffer(), etag: c.headers.get('X-Etag') || '', lu: Number(c.headers.get('X-Lu')) || 0 }; depotGarder(fichier, e); }
    } catch (x) {}
  }
  const age = e ? Date.now() - e.lu : Infinity;
  if (e && age < frais) return depotReponse(e, d);
  if (e && age < max) {
    const maj = depotMaj(fichier, env, e);
    if (ctx && ctx.waitUntil) ctx.waitUntil(maj);
    else { EN_FOND.add(maj); maj.finally(() => EN_FOND.delete(maj)); }
    return depotReponse(e, d + '-revue');
  }
  const n = await depotMaj(fichier, env, e);
  if (n && !n.erreur) return depotReponse(n, 'github');
  if (e) return depotReponse(e, 'secours');
  return new Response('GitHub ne répond pas', { status: (n && n.s) || 502 });
}
async function servir(chemin, env, ctx, o) {
  if (INTERDITS.test(chemin)) return texte('Introuvable', 404);
  let fichier = chemin;
  if (fichier === '' || fichier.endsWith('/')) fichier += 'index.html';
  const derniere = fichier.split('/').pop();
  const sansExtension = !/\.[A-Za-z0-9]{1,5}$/.test(derniere);

  // un dossier sans « / » final : /designer → /designer/
  if (sansExtension) {
    const essai = await lireGithub(fichier + '/index.html', env, 'HEAD');
    if (essai.ok) {
      const u = new URL(o.req.url);
      return new Response(null, { status: 301, headers: { 'Location': u.pathname + '/' + u.search } });
    }
  }

  // un projet express : ses échéances raccourcies, pour toute l'équipe et pour n8n
  if (derniere === 'donnees.json') { const rx = await servirDonneesExpress(fichier, env, { ...o, ctx }); if (rx) return rx; }
  const ext = (derniere.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1];
  const type = TYPES[(ext || '').toLowerCase()] || 'application/octet-stream';
  const estTexte = TEXTES.test(type);

  // n8n (lecture brute) : les fichiers lourds en cache 5 minutes, le reste lu sur GitHub à chaque fois
  const cache = caches.default;
  const cleCache = new Request('https://cache.kreative/b/' + encodeURI(fichier) + new URL(o.req.url).search);
  if (o.brut && !estTexte) {
    const vu = await cache.match(cleCache);
    if (vu) return vu;
  }

  // les pages (portail, équipe, clients) : la copie gardée par le Worker, servie tout de suite et revérifiée
  // en fond (lireDepot) ; les données JSON (projets.json, donnees.json...) revérifiées toutes les 15 s
  const jsonPage = !o.brut && /\.json$/i.test(fichier);
  const r = o.brut ? await lireGithub(fichier, env, 'GET') : await lireDepot(fichier, env, ctx, jsonPage ? 15000 : 20000, jsonPage ? 6e5 : 864e5);
  if (jsonPage && (r.ok || r.status === 404)) {
    const t = r.ok ? remplacer(await r.text(), o.origine + '/') : 'Introuvable';
    return new Response(t, { status: r.ok ? 200 : 404, headers: { 'Content-Type': r.ok ? TYPES.json : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  if (r.status === 404) {
    if (o.brut || !/^text\/html/.test(type)) return texte('Introuvable', 404);
    const en = o.qui && o.qui.role === 'designer';
    return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Kreative</title><link rel="stylesheet" href="/ui/kreative.css"></head><body class="k" style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">' +
      '<div style="text-align:center"><h1 style="font-size:34px;margin:0 0 10px">' + (en ? 'Page not found' : 'Page introuvable') + '</h1>' +
      '<p style="color:#4f4f4f;margin:0 0 22px">' + (en ? 'This page does not exist or is no longer online.' : 'Cette page n\'existe pas ou n\'est plus en ligne.') + '</p>' +
      '<a class="k-btn" href="' + (o.qui ? ACCUEILS[o.qui.role] : '/') + '">' + (en ? 'My projects' : 'Retour à mon espace') + '</a></div></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (!r.ok) return texte('GitHub ne répond pas (' + r.status + ')', 502);

  const entetes = new Headers({
    'Content-Type': type,
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': estTexte ? 'no-store' : 'private, max-age=300'
  });

  if (!estTexte) {
    const rep = new Response(r.body, { status: 200, headers: entetes });
    if (o.brut && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cleCache, rep.clone()));
    return rep;
  }
  if (o.brut) return new Response(r.body, { status: 200, headers: entetes });

  // les pages : les anciens liens GitHub deviennent ce site
  const base = o.origine + '/';
  if (r.headers.get('x-copie')) entetes.set('X-Copie', r.headers.get('x-copie'));
  if (/^text\/html/.test(type)) {
    const coq = coquille(o.qui, '/' + chemin, o.req), id = r.headers.get('x-copie-id');
    // les portails (admin, client, Studio...) : la page déjà réécrite est gardée tant que le fichier ne change pas
    if (!coq && id) {
      const cle = fichier + '|' + base, vu = HTML_PRET.get(cle);
      if (vu && vu.id === id) { if (r.body) r.body.cancel(); return new Response(vu.t, { status: 200, headers: entetes }); }
      const h = await reecrireHtml(new Response(r.body, { status: 200, headers: entetes }), base, null).text();
      if (HTML_PRET.size > 60) HTML_PRET.clear();
      if (h.length < 2e6) HTML_PRET.set(cle, { id, t: h });
      return new Response(h, { status: 200, headers: entetes });
    }
    return reecrireHtml(new Response(r.body, { status: 200, headers: entetes }), base, coq);
  }
  const longueur = Number(r.headers.get('content-length') || 0);
  if (longueur > LIMITE_REECRITURE) return new Response(r.body, { status: 200, headers: entetes });
  let t = await r.text();
  if (t.length <= LIMITE_REECRITURE) t = remplacer(t, base);
  return new Response(t, { status: 200, headers: entetes });
}

function remplacer(t, base) {
  for (const a of ANCIENS) if (t.indexOf(a) >= 0) t = t.split(a).join(base);
  // l'ancienne adresse sans « / » final
  return t.replace(/https:\/\/kreativeadsfr\.github\.io\/kreative-dossiers(?=["'\s<)])/g, base.replace(/\/$/, ''));
}

// ============================================================
//  LA COQUILLE DE L'ÉQUIPE
//  Toutes les pages de l'équipe (espaces stratégiste et designer,
//  fiche créas, dossiers de production, briefs, visuels) reçoivent
//  la même barre latérale et le même bandeau du haut que le portail :
//  le Worker les ajoute autour de la page, sans toucher aux fichiers.
//  Le style est dans ui/coquille.css, le reste (nom du projet,
//  liens « Ce projet », recherche) dans ui/coquille.js.
//  Le tableau de bord admin (/admin/) a sa propre coquille, identique.
// ============================================================
const IC = (() => {
  const p = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  return {
    accueil: p('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    dossier: p('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    doc: p('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    gens: p('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6"/>'),
    sac: p('<path d="M6 7h12l1 13H5Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
    calques: p('<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    ampoule: p('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z"/>'),
    pinceau: p('<path d="M14 4l6 6-8 8H6v-6Z"/><path d="M4 20l2-2"/>'),
    bouclier: p('<path d="M12 3 5 6v6c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6Z"/>'),
    fleche: p('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    chercher: p('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>'),
    points: p('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>'),
    sortie: p('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'),
    menu: p('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    haut_bas: p('<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>'),
    image: p('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2.5-2.5L20 17"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    message: p('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.5-.7L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5Z"/>')
  };
})();

function typePage(chemin, url) {
  let m;
  const q = url.searchParams.get('projet') || '';
  if (/^\/strategiste\/(index\.html)?$/.test(chemin)) return { type: 'strategiste' };
  if (/^\/designer\/(index\.html)?$/.test(chemin)) return { type: 'designer' };
  if (/^\/fiche\/(index\.html)?$/.test(chemin)) return { type: 'fiche', projet: q };
  if (/^\/retours\/(index\.html)?$/.test(chemin)) return { type: 'retours', projet: q };
  if ((m = chemin.match(/^\/([A-Za-z0-9_-]+)\/creas\/telecharger\.html$/))) return { type: 'telech', projet: m[1] };
  if ((m = chemin.match(/^\/([A-Za-z0-9_-]+)\/creas\/(index\.html)?$/))) return { type: 'apercu', projet: m[1] };
  if ((m = chemin.match(/^\/([A-Za-z0-9_-]+)\/(index\.html)?$/))) return { type: 'dossier', projet: m[1] };
  return { type: 'autre' };
}

function coquille(qui, chemin, req) {
  if (!qui || !req) return null;
  if (/^\/(admin|client|strategiste|designer|studio)(\/|$)/.test(chemin)) return null;   // les portails ont leur propre coquille
  const url = new URL(req.url);
  const pg = typePage(chemin, url);
  const page = '<link rel="stylesheet" href="/ui/coquille.css"><script src="/ui/page.js" defer></script>';
  // ouverte dans le portail (cadre intégré) : la page seule, sans barre latérale
  if (url.searchParams.has('integre') || req.headers.get('Sec-Fetch-Dest') === 'iframe')
    return { tete: page, ouverture: '', fermeture: '', classe: 'kc-on kc-integre kc-' + pg.type };
  const role = qui.role, en = role === 'designer';
  const e = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lien = (href, icone, texte, on) => '<a class="kc-l' + (on ? ' on' : '') + '" href="' + e(href) + '">' + IC[icone] + '<span>' + e(texte) + '</span></a>';
  const lab = t => '<div class="kc-lab">' + e(t) + '</div>';

  // la barre latérale : les mêmes sections permanentes que dans le portail (/strategiste/, /designer/, /admin/)
  const h = ACCUEILS[role];
  const actif = { fiche: 'fiche', dossier: 'dossier', retours: 'brief', apercu: 'visuels', telech: 'telechargement' }[pg.type];
  let nav = '', cta = '';
  if (role === 'admin') {
    cta = '<a class="kc-cta" href="/admin/#/clients/nouveau"><span>Nouveau client</span>' + IC.fleche + '</a>';
    nav = lab('Espace') + '<div class="kc-nav">' + lien('/admin/#/', 'accueil', 'Vue d\'ensemble') + '</div>' +
      lab('Commercial') + '<div class="kc-nav">' + lien('/admin/#/clients', 'gens', 'Clients') + lien('/admin/#/commandes', 'sac', 'Commandes') + '</div>';
  } else nav = lab(en ? 'Workspace' : 'Espace') + '<div class="kc-nav">' + lien(h + '#/', 'accueil', en ? 'Overview' : 'Vue d\'ensemble') + lien(h + '#/projets', 'dossier', en ? 'Projects' : 'Projets') + '</div>';
  nav += lab('Production') + '<div class="kc-nav">' + (en
    ? lien(h + '#/visuels', 'image', 'Previews', actif === 'visuels') + lien(h + '#/telechargement', 'telecharger', 'Downloads', actif === 'telechargement') + lien(h + '#/livrer', 'fleche', 'Deliver')
    : lien(h + '#/fiche', 'doc', 'Fiches créas', actif === 'fiche') + lien(h + '#/dossier', 'calques', 'Dossiers de production', actif === 'dossier') +
      lien(h + '#/brief', 'message', 'Briefs suivants', actif === 'brief') + (role === 'admin' ? lien(h + '#/visuels', 'image', 'Visuels', actif === 'visuels' || actif === 'telechargement') : '')) + '</div>';

  // le fil d'Ariane
  const racine = role === 'admin' ? 'Production' : en ? 'Designer' : 'Stratégiste';
  const noms = en
    ? { designer: 'My projects', apercu: 'Preview', telech: 'Download', autre: 'Page' }
    : { strategiste: role === 'admin' ? 'Espace stratégiste' : 'Mes projets', designer: 'Designer space', fiche: 'Fiche créas', retours: 'Brief suivant',
        dossier: 'Dossier de production', apercu: 'Visuels', telech: 'Téléchargement', autre: 'Page' };
  const ariane = IC.dossier + '<span>' + e(racine) + '</span><i>/</i>' +
    (pg.projet ? '<span id="kc-nom">' + e(pg.projet) + '</span><i>/</i>' : '') +
    '<b id="kc-page">' + e(noms[pg.type] || 'Page') + '</b>';

  const nom = qui.nom ? qui.nom.charAt(0).toUpperCase() + qui.nom.slice(1) : '';
  const titre = role === 'admin' ? 'Fondateur · admin' : en ? 'Designer' : 'Stratégiste';
  const conf = { role, langue: en ? 'en' : 'fr', type: pg.type, projet: pg.projet || '' };

  const ouverture = '<div class="kc" id="kc"><div class="kc-side" id="kc-side">' +
    '<a class="kc-logo" href="' + ACCUEILS[role] + '">' + LOGO_SVG + '</a>' + cta + nav +
    '<div class="kc-foot"><div class="kc-menu" id="kc-menu" hidden><a href="/_deconnexion">' + IC.sortie + '<span>' + (en ? 'Log out' : 'Se déconnecter') + '</span></a></div>' +
    '<button class="kc-mb" id="kc-mb" type="button" aria-label="Menu du compte"><span class="kc-av">' + e(nom.charAt(0) || '?') + '</span><span class="kc-qui"><b>' + e(nom) + '</b><small>' + e(titre) + '</small></span>' + IC.haut_bas + '</button></div></div>' +
    '<div class="kc-main"><div class="kc-panel"><div class="kc-top">' +
    '<button class="kc-ib kc-burger" id="kc-burger" type="button" aria-label="Menu">' + IC.menu + '</button>' +
    '<div class="kc-ariane">' + ariane + '</div>' +
    '<div class="kc-search">' + IC.chercher + '<input id="kc-cherche" placeholder="' + (en ? 'Search a project…' : 'Rechercher un projet…') + '" autocomplete="off"><kbd>⌘K</kbd><div class="kc-res" id="kc-res" hidden></div></div>' +
    '</div><div class="kc-scroll" id="kc-scroll">';
  const fermeture = '</div></div></div></div>';
  const tete = page + '<script>window.KC=' + JSON.stringify(conf).replace(/</g, '\\u003c') + '</script><script src="/ui/coquille.js" defer></script>';
  return { tete, ouverture, fermeture, classe: 'kc-on kc-shell kc-' + pg.type };
}

// une page de production ouverte directement (lien d'un email, d'une notification…)
// s'ouvre dans le portail : même barre latérale, la page au milieu
function routePortail(chemin, url) {
  if (/^\/(admin|client|strategiste|designer|studio|ui|_[a-z]+)(\/|$)/.test(chemin)) return null;
  const pg = typePage(chemin, url);
  const P = pg.projet ? '/' + encodeURIComponent(pg.projet) : '';
  return { fiche: 'fiche' + P, dossier: 'dossier' + P, retours: P ? 'brief' + P : 'brief', apercu: 'visuels' + P, telech: 'telechargement' + P }[pg.type] || null;
}

function reecrireHtml(rep, base, coq) {
  const attrs = ['href', 'src', 'poster', 'action', 'data-src', 'content'];
  let rw = new HTMLRewriter();
  for (const at of attrs) {
    for (const a of ['https://kreativeadsfr.github.io/kreative-dossiers', ANCIENS[1]]) {
      rw = rw.on('[' + at + '^="' + a + '"]', { element(el) {
        const v = el.getAttribute(at);
        if (v) el.setAttribute(at, remplacer(v, base));
      } });
    }
  }
  rw = rw.on('script', new ScriptInline(base));
  if (coq) {
    rw = rw.on('head', { element(el) { el.append(coq.tete, { html: true }); } });
    rw = rw.on('body', { element(el) {
      el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + coq.classe).trim());
      el.prepend(coq.ouverture, { html: true });
      el.append(coq.fermeture, { html: true });
    } });
  }
  return rw.transform(rep);
}

class ScriptInline {
  constructor(base) { this.base = base; this.buf = ''; this.passe = false; }
  element() { this.buf = ''; this.passe = false; }
  text(t) {
    if (this.passe) return;
    this.buf += t.text;
    if (this.buf.length > LIMITE_SCRIPT) {           // gros script : rendu tel quel
      t.replace(this.buf, { html: true });
      this.buf = ''; this.passe = true;
      return;
    }
    if (t.lastInTextNode) { t.replace(remplacer(this.buf, this.base), { html: true }); this.buf = ''; }
    else t.remove();
  }
}

function lireGithub(fichier, env, methode) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const encode = fichier.split('/').map(encodeURIComponent).join('/');
  return fetch(api + '/repos/' + DEPOT + '/contents/' + encode + '?ref=' + BRANCHE, {
    headers: {
      'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''),
      'Accept': 'application/vnd.github.raw',
      'User-Agent': 'kreative-espace',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }).then(r => {
    if (methode === 'HEAD' && r.body) r.body.cancel();
    return r;
  });
}

// n8n : l'API GitHub en lecture (sha d'un fichier, arbre du dépôt...)
async function apiGithub(chemin, env) {
  const api = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const r = await fetch(api + '/repos/' + DEPOT + '/' + chemin.replace(/^\/+/, ''), {
    headers: {
      'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''),
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'kreative-espace',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ============================================================
//  CONNEXION
// ============================================================
//  ACCES : une entrée par personne, séparées par des virgules :
//    prénom=motdepasse:rôle      (rôle : admin, strategiste ou designer)
function personnes(env) {
  const liste = [];
  for (const ligne of String(env.ACCES || '').split(/[\n,;]+/)) {
    const i = ligne.indexOf('=');
    if (i < 1) continue;
    const nom = ligne.slice(0, i).trim().toLowerCase();
    let mdp = ligne.slice(i + 1).trim(), role = '';
    const j = mdp.lastIndexOf(':');
    if (j > 0) { role = mdp.slice(j + 1).trim().toLowerCase().replace('stratégiste', 'strategiste'); mdp = mdp.slice(0, j).trim(); }
    if (/^[a-z0-9_-]{1,40}$/.test(nom) && mdp.length >= 8 && ACCUEILS[role]) liste.push({ nom, mdp, role });
  }
  return liste;
}

// la dernière connexion de chaque membre de l'équipe (page Équipe de l'admin) : au plus une écriture toutes les 5 min
const VU_EQUIPE = new Map();
function vuEquipe(env, ctx, nom) {
  const now = maintenant();
  if (now - (VU_EQUIPE.get(nom) || 0) < 3e5) return;
  VU_EQUIPE.set(nom, now);
  const w = (async () => { try { const db = await baseLiv(env); await db.prepare('INSERT OR REPLACE INTO reglages (cle, valeur) VALUES (?, ?)').bind('vu_equipe:' + nom, String(now)).run(); } catch (e) {} })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(w);
}

async function signer(env, texteASigner) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('espace:' + (env.CLE || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texteASigner));
  return btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function egal(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

async function session(req, env) {
  if (!env.CLE) return null;
  const c = (req.headers.get('Cookie') || '').split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
  if (!c) return null;
  const [nom, fin, sig] = c.slice(COOKIE.length + 1).split('.');
  if (!nom || !fin || !sig || Number(fin) < Date.now()) return null;
  if (!egal(sig, await signer(env, nom + '.' + fin))) return null;
  const p = personnes(env).find(x => x.nom === nom);           // accès retiré : plus de session
  return p ? { nom: p.nom, role: p.role } : null;
}

async function connexion(req, env, url) {
  let suite = url.searchParams.get('suite') || '/';
  let erreur = false;
  if (req.method === 'POST') {
    const f = await req.formData();
    suite = String(f.get('suite') || '/');
    const mdp = String(f.get('mdp') || '').trim();
    const p = personnes(env).find(x => egal(x.mdp, mdp));
    if (p && env.CLE) {
      const fin = Date.now() + DUREE_JOURS * 864e5;
      const valeur = p.nom + '.' + fin + '.' + (await signer(env, p.nom + '.' + fin));
      if (!/^\/(?!\/)/.test(suite) || suite === '/' || !autorise(p.role, suite.split('?')[0])) suite = ACCUEILS[p.role];
      if (estStudio(url, env) && p.role === 'admin') suite = '/';   // studio.kreativeads.fr : on reste sur le Studio
      return new Response(null, { status: 303, headers: {
        'Location': suite,
        'Set-Cookie': COOKIE + '=' + valeur + '; Path=/; Max-Age=' + DUREE_JOURS * 86400 + '; HttpOnly; Secure; SameSite=Lax',
        'Cache-Control': 'no-store' } });
    }
    erreur = true;
    await new Promise(r => setTimeout(r, 700));
  }
  if (!/^\/(?!\/)/.test(suite)) suite = '/';
  const en = /^\/(designer|[^/]+\/creas)(\/|$)/.test(suite);
  const T = en
    ? { titre: 'Sign in', sous: 'Sign in to your Kreative workspace.', mdp: 'Password', bouton: 'Sign in', err: 'Incorrect password. Please try again.' }
    : { titre: 'Connexion', sous: 'Connectez-vous à votre espace Kreative.', mdp: 'Mot de passe', bouton: 'Se connecter', err: 'Mot de passe incorrect. Veuillez réessayer.' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!DOCTYPE html><html lang="${en ? 'en' : 'fr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kreative</title><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%}html{caret-color:transparent}input{caret-color:auto}
body{background:#f9f6f4;color:#000;font:400 16px/1.5 Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px 16px}
.c{width:100%;max-width:400px;background:#fff;border:1px solid #ebe5df;border-radius:28px;padding:36px 32px;box-shadow:0 12px 40px rgba(31,31,31,.06)}
.k-marque{height:26px;width:auto;display:block;margin:0 0 30px;color:#000}
h1{font:600 32px/1.05 "Inter Tight",Inter,sans-serif;letter-spacing:-.035em;margin:0 0 8px}
p{margin:0 0 24px;color:#5b5752;font-size:15px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 8px}
input{display:block;width:100%;font:inherit;padding:14px 18px;border:1px solid #e3dcd5;border-radius:999px;background:#f9f6f4;outline:0}
input:focus{border-color:#4d94ff;background:#fff}
button{margin-top:16px;width:100%;padding:14px 20px;border:0;border-radius:999px;background:#4d94ff;color:#fff;font:600 15px Inter,sans-serif;cursor:pointer}
button:hover{background:#1f1f1f}
.err{margin:14px 0 0;color:#b3261e;font-size:14px}
</style></head><body><form class="c" method="post" action="/_connexion">
${LOGO_SVG}
<h1>${T.titre}</h1><p>${T.sous}</p>
<label for="mdp">${T.mdp}</label>
<input id="mdp" name="mdp" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="suite" value="${esc(suite)}">
<button type="submit">${T.bouton}</button>
${erreur ? '<p class="err">' + T.err + '</p>' : ''}
</form></body></html>`;
  return new Response(html, { status: erreur ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

function texte(t, statut) {
  return new Response(t, { status: statut, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ============================================================
//  PORTAIL CLIENT (15/10)
//
//  Base de données Cloudflare D1, liée au Worker sous le nom DB.
//  Les tables se créent seules au premier passage.
//
//  - Chaque client a un lien personnel : /acces/<jeton>. Il le reçoit
//    par email ; ce lien le reconnecte sur n'importe quel appareil.
//    Il ouvre une session de 180 jours (cookie k_client).
//  - /client/...        le portail du client (ou l'aperçu admin)
//  - /api/client/...    ses données
//  - /api/admin/...     clients et commandes, pour l'admin
//  - Les emails partent par n8n (secret N8N_EMAIL = adresse du webhook).
// ============================================================
const COOKIE_CLIENT = 'k_client';
const DUREE_CLIENT_JOURS = 180;
const PACKS = {
  starter: { nom: 'Starter', creas: 6, unique: 280, mensuel: 240, revisions: 2, delai: 48 },
  growth: { nom: 'Growth', creas: 12, unique: 490, mensuel: 420, revisions: null, delai: 48 },
  scale: { nom: 'Scale', creas: 24, unique: 890, mensuel: 760, revisions: null, delai: 72 },
  custom: { nom: 'Custom', creas: 30, unique: null, mensuel: null, revisions: null, delai: 72 }
};
// Les liens de paiement Stripe des packs fixes (créés dans Stripe par Kreative).
// L'identifiant du lien sert à reconnaître le pack au paiement, même avec un code promo.
const LIENS_PAIEMENT = {
  starter: { unique: ['https://buy.stripe.com/8x24gy2NO8QHdLO4Ol6c00v', 'plink_1UQg2VBaFgfyJZxjblXIJWgv'],
             mensuel: ['https://buy.stripe.com/cNi00i7446Iz37a0y56c00y', 'plink_1UQgBQBaFgfyJZxj0hoJSIQ9'] },
  growth: { unique: ['https://buy.stripe.com/fZufZg4VWeb1azCfsZ6c00w', 'plink_1UQg4OBaFgfyJZxjDEhlRHQm'],
            mensuel: ['https://buy.stripe.com/14A6oG3RSc2TdLO2Gd6c00z', 'plink_1UQgDlBaFgfyJZxjTCHsmfxo'] },
  scale: { unique: ['https://buy.stripe.com/eVq4gy1JK8QH6jm0y56c00x', 'plink_1UQg7tBaFgfyJZxj4JXOkExz'],
           mensuel: ['https://buy.stripe.com/eVqeVc3RSgj9bDG3Kh6c00A', 'plink_1UQgEbBaFgfyJZxjC5PPNH46'] }
};
const packDuLien = id => { for (const [pack, f] of Object.entries(LIENS_PAIEMENT)) for (const [formule, [, pid]] of Object.entries(f)) if (pid === id) return { pack, formule }; return null; };

// Les options (upsells), pour tous les packs. Le prix est TOUJOURS recalculé ici,
// jamais pris dans ce qu'envoie le navigateur.
const OPTIONS = [
  // l'express : un prix fixe selon le pack
  // l'express : Starter et Growth en 24 h, Scale en 48 h, Custom : la moitié du délai de chaque livraison
  { id: 'express', nom: 'Livraison express', detail: 'Livrée 2 fois plus vite', heures: { starter: 24, growth: 24, scale: 48 }, type: 'fixe', valeur: 390, par_pack: { starter: 90, growth: 190, scale: 290, custom: 390 },
    par_volume: { custom: [[70, 490]] } },   // Custom : 490 € à partir de 70 créas incluses
  // les variations de texte (22/10/2026, remplacent les A/B tests) : sur TOUTES les créas, le même visuel avec
  // 1 ou 2 textes en plus ; la 1re variation 15 € par créa, la 2e 10 € (donc 25 € par créa pour 2 variations)
  { id: 'variations', nom: 'Variations de texte', detail: 'Le même visuel avec 2 ou 3 textes, sur chaque créa', type: 'variations', valeur: 15, prix: [15, 10], max: 2 }
];
// « 1 variation de texte (2 textes par visuel) »
const nomVariations = q => (q > 1 ? q + ' variations' : '1 variation') + ' de texte (' + (q + 1) + ' textes par visuel)';
// Le pack Custom se configure dans l'espace client : nombre de créas et options.
// prix d'une option fixe : selon le pack, et pour certaines selon le volume (express du Custom : 490 € dès 70 créas)
const prixOption = (o, pack, nb) => {
  const palier = o.par_volume && o.par_volume[pack] && o.par_volume[pack].filter(x => (nb || 0) >= x[0]).pop();
  if (palier) return palier[1];
  return (o.par_pack && o.par_pack[pack] != null) ? o.par_pack[pack] : o.valeur;
};
const CUSTOM = {
  min: 30, max: 100, pas: 5,
  // 30/10/2026 : le délai dépend de la taille de CHAQUE livraison (pas du total) : [jusqu'à N créas, heures]
  // 100 créas = 4 livraisons de 25, chacune en 72 h. Le calendrier part de la 1re livraison (voir calendrierLot).
  delais_lot: [[12, 48], [25, 72], [30, 96]],
  // nombre de livraisons selon le volume (comme n8n) : 1 jusqu'à 30, 2 (à 15 jours) jusqu'à 55, 4 (une par semaine) dès 60
  lots: [[30, 1], [55, 2], [100, 4]],
  paliers: [[30, 35], [50, 32], [75, 29]],          // à partir de N créas : prix par créa
  remise_mensuel: 0.15,
  options: OPTIONS
};
// prix d'un pack (fixe ou Custom) avec ses options. Mensuel : abonnement, remise de 15 %
// (déjà comprise dans le prix mensuel des packs fixes, appliquée aussi aux options).
function devis(pack, formule, nbDemande, optionsDemandees) {
  const m = formule === 'mensuel';
  // une option : « express », ou « variations:2 » (2 variations de texte sur chaque créa) ;
  // les anciens A/B tests (« ab_texte:5 ») ne sont plus en vente : ignorés
  const demandes = {};
  for (const x of optionsDemandees || []) { const [id, q] = String(x).split(':'); demandes[id] = q === undefined ? null : Number(q); }
  let nb, unitaire, base;
  if (pack !== 'custom') {
    pack = PACKS[pack] ? pack : 'growth';
    nb = PACKS[pack].creas; base = m ? PACKS[pack].mensuel : PACKS[pack].unique; unitaire = Math.floor(base / nb);   // comme le site : 280 / 6 = 46 €
  } else {
    nb = Math.round(Number(nbDemande) || CUSTOM.min);
    nb = Math.min(CUSTOM.max, Math.max(CUSTOM.min, Math.round(nb / CUSTOM.pas) * CUSTOM.pas));
    unitaire = CUSTOM.paliers.filter(x => nb >= x[0]).pop()[1];
    base = nb * unitaire;
  }
  // les A/B tests ensemble ne dépassent jamais le nombre de créas (dans l'ordre : visuel, puis texte)
  const options = OPTIONS.filter(o => o.id in demandes).map(o => ({ ...o, qte: 1 }));
  const pc = options.filter(o => o.type === 'par_crea');
  let reste = nb;
  pc.forEach((o, k) => {
    const voulu = demandes[o.id] == null || !isFinite(demandes[o.id]) ? nb : demandes[o.id];
    o.qte = Math.min(Math.max(1, reste - (pc.length - k - 1)), Math.max(1, Math.round(voulu))); reste -= o.qte;
  });
  for (const o of options) if (o.type === 'par_crea') base += o.qte * o.valeur;
  for (const o of options) if (o.type === 'variations') {
    const q = demandes[o.id] == null || !isFinite(demandes[o.id]) ? 1 : Math.round(demandes[o.id]);
    o.qte = Math.min(o.max, Math.max(1, q)); o.par_crea = o.prix.slice(0, o.qte).reduce((a, b) => a + b, 0); base += nb * o.par_crea;
  }
  if (pack === 'custom' && m) base = base * (1 - CUSTOM.remise_mensuel);
  for (const o of options) if (o.type === 'pct') base += base * o.valeur / 100;
  for (const o of options) if (o.type === 'fixe') base += prixOption(o, pack, nb);
  const total = Math.round(base);
  const P = PACKS[pack];
  const nomOpt = o => o.type === 'variations' ? nomVariations(o.qte) : o.nom + (o.type === 'par_crea' ? ' × ' + o.qte : '');
  // ce que voit le client sur la page Stripe : le nom du pack, puis le contenu en points
  const points = [nb + (pack === 'custom' ? ' créatives' : ' visuels statiques') + (m ? ' par mois' : ''), 'Livrés en 1:1, 4:5 et 9:16'].concat(options.map(nomOpt));
  return { pack, formule: m ? 'mensuel' : 'unique', nb, options: options.map(o => o.type === 'par_crea' || o.type === 'variations' ? o.id + ':' + o.qte : o.id), unitaire, total,
    nom: 'Pack ' + P.nom, description: points.join(' • '),
    libelle: 'Pack ' + P.nom + (m ? ' · abonnement mensuel' : ' · paiement en une fois') + ' · ' + nb + ' créatives' + (m ? ' par mois' : '') +
      (options.length ? ' · ' + options.map(nomOpt).join(', ') : '') };
}

// le délai de livraison (en heures, après le brief) : celui du pack, ou selon le volume
// pour le Custom ; l'express le divise par deux
// le Custom : nombre de livraisons, taille de la livraison n, et son délai
const lotsCustom = nb => (CUSTOM.lots.find(x => (nb || 0) <= x[0]) || CUSTOM.lots[CUSTOM.lots.length - 1])[1];
const tailleLot = (nb, n, sur) => Math.floor((nb || 0) / sur) + ((n - 1) < (nb || 0) % sur ? 1 : 0);
const delaiLot = taille => (CUSTOM.delais_lot.find(x => taille <= x[0]) || CUSTOM.delais_lot[CUSTOM.delais_lot.length - 1])[1];
// le délai de la 1re livraison (le Custom : selon sa taille ; l'express, sur la 1re livraison seulement, le divise par deux)
function delaiHeures(pack, nb, options) {
  const h = pack === 'custom' ? delaiLot(tailleLot(nb, 1, lotsCustom(nb))) : (PACKS[pack] || PACKS.growth).delai;
  if (!String(options || '').includes('express')) return h;
  const ex = OPTIONS.find(o => o.id === 'express'), fixe = ex && ex.heures && ex.heures[pack];
  return fixe != null ? fixe : Math.round(h / 2);
}

// ---------- l'express dans les échéances de l'équipe ----------
// n8n (le Moteur) écrit les échéances du dossier (fiche, designer, client) sans connaître l'express.
// Le portail les raccourcit à la lecture du donnees.json : pages de l'équipe, fiche créas, rappels n8n
// (qui lisent par /_n8n/) et l'espace client voient donc tous les mêmes dates express.
// Fenêtre normale du Moteur : 48 h (Starter, Growth), 72 h (Scale et Custom, livraison par livraison) ;
// fenêtre express : 24 h, 24 h, 48 h, et la moitié pour le Custom. Les étapes gardent leurs proportions.
function accelererDonnees(d, pack) {
  if (!d || !d.deadline || d.express_applique) return d;
  const fin = Date.parse(d.deadline); if (!isFinite(fin)) return d;
  const normal = (PACKS[pack] || PACKS[d.pack] || PACKS.scale).delai || 72;
  const ex = OPTIONS.find(o => o.id === 'express'), fixe = ex && ex.heures && ex.heures[pack];
  const rapide = fixe != null ? fixe : Math.round(normal / 2);
  if (!(rapide > 0 && rapide < normal)) return d;
  const H = 36e5, debut = fin - normal * H, f = rapide / normal;
  const plusTot = t => { const x = Date.parse(t || ''); return isFinite(x) ? new Date(Math.max(debut, debut + (x - debut) * f)).toISOString() : t; };
  return { ...d, deadline: new Date(debut + rapide * H).toISOString(), deadline_strategiste: plusTot(d.deadline_strategiste), deadline_designer: plusTot(d.deadline_designer),
    express: true, express_applique: { heures: rapide, avant: d.deadline } };
}
// ---------- le calendrier d'un Custom (30/10/2026) ----------
// Livraison 1 : son délai après le brief (selon sa taille, divisé par deux en express).
// Les suivantes : 15 jours (en 2 fois) ou 7 jours (en 4 fois) après la PRÉCÉDENTE date prévue, à partir du jour
// où le client a VRAIMENT reçu la livraison 1 (sinon sa date prévue). Chaque livraison suivante garde son délai
// (selon sa taille) : l'équipe la démarre ce délai avant sa date. Comme le Moteur : fiche au tiers du délai,
// designer 8 h avant la livraison.
function calendrierLot(k, n, sur, l1Recue) {
  const H = 36e5, ex = String(k.options || '').includes('express');
  const h1 = delaiLot(tailleLot(k.nb_creas, 1, sur)) / (ex ? 2 : 1);
  const debut1 = k.brief_le || k.cree_le || maintenant();
  const d1 = l1Recue || (debut1 + h1 * H);
  const fin = n === 1 ? d1 : d1 + (n - 1) * intervalleJours(sur) * 864e5;
  const h = n === 1 ? h1 : delaiLot(tailleLot(k.nb_creas, n, sur));
  const debut = n === 1 && !l1Recue ? debut1 : fin - h * H;
  return { debut, fin, heures: h, strategiste: debut + (fin - debut) / 3, designer: Math.max(debut, fin - 8 * H) };
}
// la livraison n d'un dossier de Custom (…_L2), et quand le client a reçu la livraison 1 (version 1 envoyée)
async function premiereRecue(env, projet) {
  try { const db = await baseLiv(env); const r = await db.prepare("SELECT MIN(envoye_le) AS le FROM livraisons WHERE dossier IN (?, ?) AND version = 1 AND envoye_le IS NOT NULL").bind(projet + '_L1', projet).first(); return (r && r.le) || null; } catch (e) { return null; }
}
async function calerCustom(env, d, k, dossier) {
  if (!d || !k || k.pack !== 'custom') return d;
  const sur = lotsCustom(k.nb_creas), m = String(dossier || d.dossier || '').match(/_L(\d+)$/), n = Math.min(sur, Number((d.livraison && d.livraison.n) || (m && m[1]) || 1));
  const projet = String(dossier || d.dossier || '').replace(/_L\d+$/, '');
  const c = calendrierLot(k, n, sur, n > 1 ? await premiereRecue(env, projet) : null), iso = t => new Date(t).toISOString();
  return { ...d, deadline: iso(c.fin), deadline_strategiste: iso(c.strategiste), deadline_designer: iso(c.designer), deadline_heures: c.heures,
    express: n === 1 && String(k.options || '').includes('express'), calendrier: { n, sur, heures: c.heures, debut: iso(c.debut) }, express_applique: true };
}
// la commande express d'un dossier (un Custom : le dossier du projet, sans « _L2 »), ou null
async function commandeExpress(env, dossier) {
  if (!env.DB || !/^[A-Za-z0-9_-]{3,80}$/.test(dossier)) return null;
  const projet = dossier.replace(/_L\d+$/, '');
  try {
    const db = await base(env);
    return await db.prepare("SELECT pack, nb_creas, options, brief_le, cree_le FROM commandes WHERE (dossier IN (?, ?) OR dossier LIKE ?) AND (options LIKE '%express%' OR pack = 'custom') AND statut != 'annule' ORDER BY cree_le DESC LIMIT 1").bind(dossier, projet, projet + '_L%').first();
  } catch (e) { return null; }
}
async function servirDonneesExpress(fichier, env, o) {
  const m = fichier.match(/^([A-Za-z0-9_-]{3,80})\/donnees\.json$/);
  if (!m) return null;
  const k = await commandeExpress(env, m[1]);
  if (!k) return null;
  const r = o.brut ? await lireGithub(fichier, env, 'GET') : await lireDepot(fichier, env, o.ctx, 15000, 6e5);
  if (!r.ok) return null;
  let d; try { d = JSON.parse(await r.text()); } catch (e) { return null; }
  let t = JSON.stringify(k.pack === 'custom' ? await calerCustom(env, d, k, m[1]) : accelererDonnees(d, k.pack));
  if (!o.brut && o.origine) t = remplacer(t, o.origine + '/');
  return new Response(t, { status: 200, headers: { 'Content-Type': TYPES.json, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

// brief = commande confirmée, le brief n'est pas encore arrivé
const STATUTS = ['brief', 'production', 'livre', 'revisions', 'valide', 'annule'];

let BASE_PRETE = false;
// v70 : la base est vérifiée une seule fois par version. Avant, chaque démarrage du Worker refaisait
// ~25 allers-retours (tables, colonnes, index) : près d'une seconde sur la 1re ouverture.
// Augmenter SCHEMA_V à chaque nouvelle table ou colonne : la vérification complète repasse une fois.
const SCHEMA_V = 70;
let SCHEMA_EN_COURS = null;
async function base(env) {
  if (!env.DB) throw new Error('Base de données absente : liez une base D1 au Worker sous le nom DB.');
  if (!BASE_PRETE) {
    if (!SCHEMA_EN_COURS) SCHEMA_EN_COURS = env.DB.prepare("SELECT v FROM kreative_schema WHERE nom = 'base'").first().then(r => !!r && r.v === SCHEMA_V).catch(() => false);
    if (await SCHEMA_EN_COURS) { BASE_PRETE = LIV_PRETE = WIMMOV_PRET = STUDIO_PRET = true; return env.DB; }
    SCHEMA_EN_COURS = null;
    await migrerBase(env);
    // les autres parties de la base, puis la version notée
    await baseLiv(env); await baseWimmov(env); await baseStudio(env);
    try {
      await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS kreative_schema (nom TEXT PRIMARY KEY, v INTEGER)'),
        env.DB.prepare("INSERT OR REPLACE INTO kreative_schema (nom, v) VALUES ('base', ?)").bind(SCHEMA_V)]);
    } catch (e) {}
  }
  return env.DB;
}
async function migrerBase(env) {
  {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, marque TEXT NOT NULL, contact TEXT, email TEXT UNIQUE,
        telephone TEXT, site TEXT, statut TEXT DEFAULT 'actif', jeton TEXT UNIQUE, notes TEXT, cree_le INTEGER, vu_le INTEGER)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS commandes (id TEXT PRIMARY KEY, ref TEXT UNIQUE, client_id TEXT NOT NULL, pack TEXT,
        formule TEXT, nb_creas INTEGER, prix INTEGER, dossier TEXT, statut TEXT DEFAULT 'brief', cree_le INTEGER, brief_le INTEGER,
        livre_le INTEGER, deadline INTEGER, notes TEXT)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS activite (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, commande_id TEXT,
        type TEXT, texte TEXT, le INTEGER)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS factures (id TEXT PRIMARY KEY, client_id TEXT, commande_id TEXT, numero TEXT,
        montant REAL, montant_ht REAL, devise TEXT DEFAULT 'eur', statut TEXT, emise_le INTEGER, payee_le INTEGER, pdf TEXT, lien TEXT,
        email TEXT, source TEXT, stripe_id TEXT UNIQUE, cree_le INTEGER)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS abonnements (stripe_abo TEXT PRIMARY KEY, client_id TEXT, statut TEXT, resilie_le INTEGER,
        fin_le INTEGER, maj_le INTEGER)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS rappels (cle TEXT PRIMARY KEY, client_id TEXT, commande_id TEXT, type TEXT, n INTEGER, sur INTEGER,
        dossier TEXT, le INTEGER, envoye_le INTEGER)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_cmd_client ON commandes(client_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_act_client ON activite(client_id, le)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_fac_client ON factures(client_id)`)
    ]);
    // colonnes ajoutées après coup : sans effet si elles existent déjà
    for (const col of ['avis_le INTEGER', 'avis_ignore_le INTEGER', 'valide_le INTEGER', 'stripe_session TEXT', 'stripe_abo TEXT', 'stripe_facture TEXT', 'options TEXT', 'brief_json TEXT']) {
      try { await env.DB.prepare('ALTER TABLE commandes ADD COLUMN ' + col).run(); } catch (e) {}
    }
    for (const col of ['stripe_le INTEGER', 'offre_le INTEGER']) { try { await env.DB.prepare('ALTER TABLE abonnements ADD COLUMN ' + col).run(); } catch (e) {} }
    for (const col of ['stripe_client TEXT', 'photo TEXT', 'photo_le INTEGER', 'app_le INTEGER', 'special TEXT']) {
      try { await env.DB.prepare('ALTER TABLE clients ADD COLUMN ' + col).run(); } catch (e) {}
    }
    try { await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS i_cmd_session ON commandes(stripe_session)').run(); } catch (e) {}
    // une facture Stripe = une seule commande, même si Stripe envoie plusieurs événements en même temps
    try { await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS i_cmd_facture ON commandes(stripe_facture) WHERE stripe_facture IS NOT NULL').run(); } catch (e) {}
    // numéros de commande lisibles : 1001, 1002… (les anciens « K-101 » deviennent 1001)
    try { await env.DB.prepare("UPDATE commandes SET ref = CAST(CAST(substr(ref, 3) AS INTEGER) + 900 AS TEXT) WHERE ref LIKE 'K-%'").run(); } catch (e) {}
    BASE_PRETE = true;
    // la démo n'existe plus : ses clients, commandes et factures fictifs s'effacent tout seuls
    try { if (await env.DB.prepare("SELECT 1 AS x FROM clients WHERE id LIKE 'c_demo_%' LIMIT 1").first()) await retirerDemo(env.DB, env); } catch (e) {}
  }
  return env.DB;
}

function aleatoire(n) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', o = new Uint8Array(n);
  crypto.getRandomValues(o);
  return Array.from(o, x => a[x % a.length]).join('');
}
const maintenant = () => Date.now();
const propre = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
const emailValide = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function noter(db, client_id, commande_id, type, texte) {
  await db.prepare('INSERT INTO activite (client_id, commande_id, type, texte, le) VALUES (?,?,?,?,?)')
    .bind(client_id, commande_id || null, type, texte, maintenant()).run();
}

async function sessionClient(req, env) {
  if (!env.CLE) return null;
  const c = (req.headers.get('Cookie') || '').split(/;\s*/).find(x => x.startsWith(COOKIE_CLIENT + '='));
  if (!c) return null;
  const [id, fin, sig] = c.slice(COOKIE_CLIENT.length + 1).split('.');
  if (!id || !fin || !sig || Number(fin) < maintenant()) return null;
  if (!egal(sig, await signer(env, 'client.' + id + '.' + fin))) return null;
  const db = await base(env);
  const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  if (!cl || cl.statut === 'bloque') return null;
  return cl;
}

async function corpsJson(req) {
  try { return await req.json(); } catch (e) { return {}; }
}

// le lien d'accès du client, absolu
const lienAcces = (url, jeton) => url.origin + '/acces/' + jeton;

async function envoyerEmail(env, donnees) {
  // les clients de démonstration (@example.com) ne reçoivent jamais rien
  if (/@example\.(com|org|net)$/i.test(String(donnees && donnees.a || ''))) return { ok: true, demo: true, message: 'Client de démonstration : aucun email envoyé.' };
  if (!env.N8N_EMAIL) return { ok: false, message: 'Envoi d\'email pas encore branché (secret N8N_EMAIL manquant).' };
  try {
    const r = await fetch(env.N8N_EMAIL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kreative-Cle': env.CLE || '' },
      body: JSON.stringify(donnees) });
    return r.ok ? { ok: true } : { ok: false, message: 'n8n a répondu ' + r.status };
  } catch (e) { return { ok: false, message: 'n8n injoignable' }; }
}

async function routerPortail(req, env, ctx, url, chemin) {
  const methode = req.method;

  // ---- le lien personnel du client ----
  const acces = chemin.match(/^\/acces\/([A-Za-z0-9]{16,64})\/?$/);
  if (acces) {
    const db = await base(env);
    const cl = await db.prepare('SELECT id, statut FROM clients WHERE jeton = ?').bind(acces[1]).first();
    if (!cl || cl.statut === 'bloque') return redirection('/client/connexion?lien=invalide');
    const fin = maintenant() + DUREE_CLIENT_JOURS * 864e5;
    const valeur = cl.id + '.' + fin + '.' + (await signer(env, 'client.' + cl.id + '.' + fin));
    await db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(maintenant(), cl.id).run();
    return new Response(null, { status: 302, headers: { 'Location': '/client/', 'Cache-Control': 'no-store',
      'Set-Cookie': COOKIE_CLIENT + '=' + valeur + '; Path=/; Max-Age=' + DUREE_CLIENT_JOURS * 86400 + '; HttpOnly; Secure; SameSite=Lax' } });
  }
  if (chemin === '/client/sortie') return new Response(null, { status: 303, headers: { 'Location': '/client/connexion',
    'Set-Cookie': COOKIE_CLIENT + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });

  // ---- demander son lien par email (public, réponse toujours identique) ----
  if (chemin === '/api/client/lien' && methode === 'POST') {
    const b = await corpsJson(req);
    const email = propre(b.email, 160).toLowerCase();
    if (emailValide(email)) {
      const db = await base(env);
      const cl = await db.prepare('SELECT * FROM clients WHERE lower(email) = ? AND statut != ?').bind(email, 'bloque').first();
      if (cl) {
        ctx.waitUntil(estWimmov(cl) ? envoyerAccesWimmov(env, url, cl, [email]) : envoyerEmail(env, emailAcces(url, cl, lienAcces(url, cl.jeton))));
        ctx.waitUntil(noter(db, cl.id, null, 'lien', 'Lien d\'accès redemandé par email'));
      } else if ((await emailsWimmov(env)).includes(email)) {
        const w = await clientWimmov(db);
        if (w) ctx.waitUntil(envoyerAccesWimmov(env, url, w, [email]));
      }
    }
    await new Promise(r => setTimeout(r, 400));
    return json({ ok: true, message: 'Si cette adresse correspond à un compte Kreative, vous allez recevoir votre lien d\'accès dans quelques minutes.' });
  }

  // ---- Stripe (public, signé) ----
  if (chemin === '/api/stripe/webhook' && methode === 'POST') return stripeWebhook(req, env, ctx, url);
  // ---- n8n (clé dans l'en-tête X-Kreative-Cle) ----
  if (chemin.startsWith('/api/n8n/')) return apiN8n(req, env, ctx, url, chemin.slice('/api/n8n'.length), methode);
  // ---- les fichiers joints aux retours de Wimmov ----
  const wp = chemin.match(/^\/api\/wimmov\/pieces\/(wp_[A-Za-z0-9]+)$/);
  if (wp && (methode === 'GET' || methode === 'HEAD')) return servirPieceWimmov(req, env, url, wp[1]);
  // ---- les fichiers livrés ----
  const fic = chemin.match(/^\/fichiers\/(fi_[A-Za-z0-9_]+)$/);
  if (fic && (methode === 'GET' || methode === 'HEAD')) return servirFichier(req, env, ctx, url, fic[1]);
  // ---- API de l'équipe : livraisons (designer et admin) ----
  if (chemin.startsWith('/api/equipe/')) {
    const qui = await session(req, env);
    if (!qui || !['admin', 'designer', 'strategiste'].includes(qui.role)) return json({ erreur: 'Accès refusé' }, 403);
    const sousChemin = chemin.slice('/api/equipe'.length);
    // le stratégiste : l'état des projets, les retours du client, ses retouches de textes
    if (qui.role === 'strategiste' && !(
      (sousChemin === '/etats' && methode === 'GET') ||
      (sousChemin === '/fiche' && methode === 'POST') ||
      (/^\/livraisons\/[A-Za-z0-9_-]{3,80}$/.test(sousChemin) && methode === 'GET') ||
      (/^\/livraisons\/l_[A-Za-z0-9_]+\/retouches-faites$/.test(sousChemin) && methode === 'POST') ||
      (sousChemin === '/commentaires' && methode === 'POST') || (/^\/commentaires\/\d+$/.test(sousChemin) && methode === 'DELETE')))
      return json({ erreur: 'Accès refusé' }, 403);
    return apiEquipe(req, env, ctx, url, chemin.slice('/api/equipe'.length), methode, qui);
  }

  // ---- l'app de l'espace client (à installer sur l'écran d'accueil) : manifeste et service worker, publics ----
  if (chemin === '/client/manifest.webmanifest') return new Response(JSON.stringify(MANIFESTE), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  if (chemin === '/client/sw.js') return new Response(SERVICE_WORKER, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/client/' } });
  // ---- l'app de l'admin (à installer sur l'ordinateur ou le téléphone de Dario) : manifeste et service worker, publics ----
  if (chemin === '/admin/manifest.webmanifest') return new Response(JSON.stringify(MANIFESTE_ADMIN), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  if (chemin === '/admin/sw.js') return new Response(SERVICE_WORKER_ADMIN, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/admin/' } });
  // ---- la page de connexion du client (publique) ----
  if (chemin === '/client/connexion') return servir('client/connexion.html', env, ctx, { brut: false, origine: url.origin, req });

  const estClient = chemin === '/client' || chemin.startsWith('/client/') || chemin.startsWith('/api/client/');
  const estAdminApi = chemin.startsWith('/api/admin/');
  if (!estClient && !estAdminApi) return null;

  const equipe = await session(req, env);
  const admin = equipe && equipe.role === 'admin';

  // ---- API admin ----
  if (estAdminApi) {
    if (!admin) return json({ erreur: 'Accès refusé' }, 403);
    return apiAdmin(req, env, ctx, url, chemin.slice('/api/admin'.length), methode);
  }

  // ---- portail client : le client connecté, ou l'admin en aperçu (?client=ID) ----
  let cl = await sessionClient(req, env);
  if (!cl && admin) {
    const id = url.searchParams.get('client') || (req.headers.get('Referer') && new URL(req.headers.get('Referer')).searchParams.get('client'));
    if (id) cl = await (await base(env)).prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  }
  if (chemin.startsWith('/api/client/')) {
    if (!cl) return json({ erreur: 'Connexion requise' }, 401);
    const apercu = !!admin && !(await sessionClient(req, env));
    if (chemin === '/api/client/wimmov' || chemin.startsWith('/api/client/wimmov/')) return apiWimmovClient(req, env, ctx, url, chemin.slice('/api/client/wimmov'.length), methode, cl, apercu);
    // Wimmov ne résilie pas depuis son espace, et ne commande pas les packs des autres clients
    if (estWimmov(cl) && /^\/api\/client\/(abonnement\/|paiement$)/.test(chemin)) return json({ erreur: 'Écrivez-nous sur WhatsApp pour votre abonnement.' }, 403);
    const liv = await apiClientLivraisons(req, env, ctx, url, chemin.slice('/api/client'.length), methode, cl, apercu);
    if (liv) return liv;
    return apiClient(req, env, ctx, url, chemin.slice('/api/client'.length), methode, cl, apercu);
  }
  if (!cl && !admin) return redirection('/client/connexion');
  if (methode !== 'GET' && methode !== 'HEAD') return texte('Méthode non autorisée', 405);
  // une seule page pour tout le portail (les écrans changent sans recharger)
  if (chemin === '/client' ) return redirection('/client/' + url.search);
  if (/^\/client\/[^.]*$/.test(chemin)) return servir(estWimmov(cl) ? 'client/wimmov.html' : 'client/index.html', env, ctx, { brut: false, origine: url.origin, req });
  return null;
}

// ---------- l'avancement d'une commande, lu dans le dossier de production ----------
// Petit cache en mémoire (20 s) : 30 clients qui ouvrent leur espace en même
// temps ne déclenchent pas 30 fois les mêmes lectures sur GitHub.
const CACHE_JSON = new Map();
async function lireJsonDepot(env, chemin) {
  const vu = CACHE_JSON.get(chemin);
  if (vu && vu.fin > Date.now()) return vu.v;
  let v = null;
  // la copie gardée par le Worker (v70) : revérifiée en fond après 20 s, GitHub attendu seulement après 10 min sans lecture
  try { const r = await lireDepot(chemin, env, null, 20000, 6e5); v = r.ok ? await r.json() : null; } catch (e) { v = null; }
  if (CACHE_JSON.size > 300) CACHE_JSON.clear();
  CACHE_JSON.set(chemin, { v: v && JSON.stringify(v).length > 300000 ? { dossier: v.dossier, deadline: v.deadline, brand_name: v.brand_name, envois: v.envois, livre: v.livre, livraison: v.livraison, nb_creas: v.nb_creas, pack: v.pack, abonnement: v.abonnement, deadline_strategiste: v.deadline_strategiste, deadline_designer: v.deadline_designer } : v, fin: Date.now() + 20000 });
  return v;
}
// Une seule source de vérité pour le statut et les étapes, partout :
//   Commande confirmée → Brief envoyé → Production → Livraison → Validation (→ avis)
// Le brief compte comme reçu dès qu'un dossier de production est relié.
// La production est finie quand le designer a livré (livraison.json) ou que
// les créatives sont parties chez le client.
async function avancement(env, cmd) {
  const brief = !!cmd.dossier || !!cmd.brief_le;
  const auClient = ['livre', 'revisions', 'valide'].includes(cmd.statut);
  let d = null, envoye = false, designer = false;
  if (cmd.dossier) {
    const [donnees, envois, liv] = await Promise.all(['donnees', 'envois', 'livraison'].map(f => lireJsonDepot(env, cmd.dossier + '/' + f + '.json')));
    d = cmd.pack === 'custom' ? await calerCustom(env, donnees, cmd, cmd.dossier) : String(cmd.options || '').includes('express') ? accelererDonnees(donnees, cmd.pack) : donnees;
    envoye = !!(envois && Array.isArray(envois.envois) && envois.envois.length);
    designer = !!(liv && liv.livre);
    // les versions déposées dans le portail et le Kanban de Kreative disent la même chose au client
    try {
      const db = await baseLiv(env);
      let [v, o] = await Promise.all([
        db.prepare(`SELECT statut, MAX(COALESCE(cree_le,0), COALESCE(depose_le,0), COALESCE(verifie_le,0), COALESCE(envoye_le,0), COALESCE(review_le,0), COALESCE(retouche_le,0)) AS le
          FROM livraisons WHERE dossier = ? OR dossier LIKE ? ORDER BY COALESCE(depose_le, cree_le) DESC LIMIT 1`).bind(cmd.dossier, cmd.dossier + '_L%').first(),
        db.prepare('SELECT etape, le FROM prod_etapes WHERE dossier = ?').bind(cmd.dossier).first()]);
      const fiche = envois && Array.isArray(envois.envois) && envois.envois.length ? Date.parse((e => typeof e === 'string' ? e : (e || {}).le)(envois.envois[envois.envois.length - 1]) || '') || 0 : 0;
      if (o && o.le <= Math.max(v ? v.le : 0, fiche)) o = null;
      if (v) { envoye = true; designer = v.statut === 'a_verifier' || (designer && v.statut !== 'brouillon' && v.statut !== 'a_corriger' && v.statut !== 'review_terminee'); }
      if (o && ['desi', 'livrer', 'client'].includes(o.etape)) envoye = true;
      if (o && ['livrer', 'client'].includes(o.etape)) designer = true;
      if (o && o.etape === 'strat') { envoye = false; designer = false; }
    } catch (e) {}
  }
  const etat = cmd.statut === 'annule' ? 'annule' : auClient ? cmd.statut : brief ? 'production' : 'confirmee';
  const etapes = [
    { cle: 'commande', titre: 'Commande confirmée', fait: true },
    { cle: 'brief', titre: 'Brief envoyé', fait: brief, detail: 'À remplir depuis votre espace' },
    { cle: 'production', titre: 'Production', fait: auClient || designer,
      detail: designer ? 'Contrôle qualité avant l\'envoi' : envoye ? 'Création des visuels' : 'Stratégie et copywriting' },
    { cle: 'livraison', titre: 'Livraison de vos créatives', fait: auClient, detail: 'Dernières vérifications' },
    { cle: 'validation', titre: 'Validation', fait: cmd.statut === 'valide', detail: cmd.statut === 'revisions' ? 'Retouches en cours' : 'À vous de valider' },
    { cle: 'avis', titre: 'Votre avis Trustpilot', fait: !!cmd.avis_le, option: true, detail: 'Une minute pour nous noter' }
  ];
  const coeur = etapes.filter(x => !x.option);
  const faites = coeur.filter(x => x.fait).length;
  const enCours = coeur.find(x => !x.fait) || (cmd.avis_le ? null : etapes[5]);
  const P = PACKS[cmd.pack] || PACKS.growth;
  const duDossier = d && Date.parse(d.deadline);
  const deadline = cmd.deadline || (duDossier && duDossier > (cmd.cree_le || 0) ? duDossier : null) || (cmd.brief_le ? cmd.brief_le + delaiHeures(cmd.pack, cmd.nb_creas, cmd.options) * 36e5 : null);
  return { etat, etapes, progression: Math.round(faites * 100 / coeur.length), en_cours: enCours ? enCours.cle : null,
    deadline: deadline || null, marque_dossier: d && d.brand_name };
}

// le statut suit la réalité : un brief reçu (dossier relié) fait passer en production
async function synchroStatuts(db) {
  await db.prepare("UPDATE commandes SET statut = 'production', brief_le = COALESCE(brief_le, ?) WHERE statut = 'brief' AND ((dossier IS NOT NULL AND dossier != '') OR brief_le IS NOT NULL)").bind(maintenant()).run();
}

async function commandesDuClient(db, env, id, detail) {
  await synchroStatuts(db);
  const { results } = await db.prepare('SELECT * FROM commandes WHERE client_id = ? AND statut != ? ORDER BY cree_le DESC').bind(id, 'annule').all();
  if (!detail) return results;
  return Promise.all(results.map(async c => ({ ...c, ...(await avancement(env, c)) })));
}

const FACTURE_PUBLIQUE = f => ({ id: f.id, commande_id: f.commande_id, numero: f.numero, montant: f.montant, montant_ht: f.montant_ht, devise: f.devise,
  statut: f.statut, emise_le: f.emise_le, payee_le: f.payee_le, pdf: f.pdf, lien: f.lien });

// ---------- API du client ----------
async function apiClient(req, env, ctx, url, chemin, methode, cl, apercu) {
  const db = await base(env);
  let m;
  if (chemin === '/moi' && methode === 'GET') {
    const commandes = await commandesDuClient(db, env, cl.id, true);
    // les créatives livrées dans le portail, par commande (et s'il y a une review en attente)
    try {
      const dossiers = commandes.map(c => c.dossier).filter(Boolean);
      if (dossiers.length) {
        const { results: L } = await (await baseLiv(env)).prepare("SELECT dossier, statut, envoye_le FROM livraisons WHERE statut IN ('envoyee','review_terminee','approuvee') AND (" +
          dossiers.map(() => 'dossier = ? OR dossier LIKE ?').join(' OR ') + ')').bind(...dossiers.flatMap(d => [d, d + '_L%'])).all();
        for (const c of commandes) { const x = L.filter(l => c.dossier && baseDossier(l.dossier) === baseDossier(c.dossier)); c.creatives = x.length; c.a_reviewer = x.some(l => l.statut === 'envoyee'); }
        await briefsSuivants(env, cl, commandes, L);
      }
    } catch (e) {}
    const [{ results: activite }, { results: factures }] = await Promise.all([
      db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 12').bind(cl.id).all(),
      db.prepare("SELECT * FROM factures WHERE client_id = ? AND statut != 'brouillon' ORDER BY emise_le DESC").bind(cl.id).all()]);
    if (!apercu) ctx.waitUntil(db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(maintenant(), cl.id).run());
    return json({ apercu, client: { id: cl.id, marque: cl.marque, contact: cl.contact, email: cl.email, telephone: cl.telephone, site: cl.site, cree_le: cl.cree_le, photo_le: cl.photo ? cl.photo_le || 1 : null },
      commandes, activite, factures: factures.map(FACTURE_PUBLIQUE), abonnements: await abonnementsDuClient(db, cl.id), packs: PACKS, custom: CUSTOM, options: OPTIONS, paiement: !!env.STRIPE_SECRET, stripe_public: env.STRIPE_SECRET && env.STRIPE_PUBLIC ? env.STRIPE_PUBLIC : null,
      liens: Object.fromEntries(Object.entries(LIENS_PAIEMENT).map(([k, f]) => [k, { unique: f.unique[0], mensuel: f.mensuel[0] }])) });
  }
  if (chemin === '/photo' && methode === 'GET') return imagePhoto(cl.photo);
  // en aperçu, l'admin voit tout mais ne change rien à la place du client
  if (methode !== 'GET' && apercu) return json({ erreur: 'Aperçu : rien n\'est enregistré à la place du client.' }, 403);

  // son profil
  // l'app : installée (ouverte depuis l'écran d'accueil), notifications
  if (chemin === '/app' && methode === 'POST') {
    if (!apercu) await db.prepare('UPDATE clients SET app_le = COALESCE(app_le, ?) WHERE id = ?').bind(maintenant(), cl.id).run();
    return json({ ok: true });
  }
  if (chemin === '/push/cle' && methode === 'GET') return json({ cle: (await clesVapid(env)).publique });
  if (chemin === '/push' && methode === 'POST') {
    if (apercu) return json({ ok: true });
    const b = await corpsJson(req), ep = String((b.subscription && b.subscription.endpoint) || '');
    if (!/^https:\/\//.test(ep) && !(env.PUSH_TEST && ep.startsWith(env.PUSH_TEST))) return json({ erreur: 'Abonnement invalide' }, 400);
    const ldb = await baseLiv(env);
    await ldb.prepare('INSERT INTO push_abos (endpoint, client_id, cree_le) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET client_id = excluded.client_id').bind(ep.slice(0, 1000), cl.id, maintenant()).run();
    await db.prepare('UPDATE clients SET app_le = COALESCE(app_le, ?) WHERE id = ?').bind(maintenant(), cl.id).run();
    return json({ ok: true });
  }
  if (chemin === '/notifications/derniere' && methode === 'GET') {
    const n = await (await baseLiv(env)).prepare('SELECT titre, texte, url, cree_le FROM notifications WHERE client_id = ? ORDER BY id DESC LIMIT 1').bind(cl.id).first();
    return json(n || { titre: 'Kreative', texte: 'Du nouveau dans votre espace.', url: '/client/' });
  }
  // avant de résilier : l'offre pour rester (une seule fois par abonnement), et l'accepter
  if (chemin === '/abonnement/offre' && methode === 'GET') {
    const A = (await abonnementsDuClient(db, cl.id)).find(a => a.id === url.searchParams.get('abo'));
    if (!A) return json({ erreur: 'Abonnement introuvable.' }, 404);
    return json({ offre: A.statut === 'actif' && A.resiliable && !A.offre_le ? await offreFidelite(env) : null });
  }
  if (chemin === '/abonnement/garder' && methode === 'POST') {
    const b = await corpsJson(req);
    const A = (await abonnementsDuClient(db, cl.id)).find(a => a.id === String(b.abo || ''));
    if (!A) return json({ erreur: 'Abonnement introuvable.' }, 404);
    if (A.statut !== 'actif' || A.offre_le) return json({ erreur: 'Cette offre n\'est plus disponible.' }, 409);
    const o = await offreFidelite(env);
    if (!o) return json({ erreur: 'Cette offre n\'est plus disponible.' }, 409);
    try { await appelStripe(env, 'subscriptions/' + encodeURIComponent(A.id), { discounts: [{ coupon: COUPON_FIDELITE }] }); }
    catch (e) { return json({ erreur: 'Stripe n\'a pas pu appliquer l\'offre (' + e.message + '). Écrivez-nous sur WhatsApp.' }, 502); }
    await db.prepare(`INSERT INTO abonnements (stripe_abo, client_id, statut, offre_le, maj_le) VALUES (?,?,?,?,?)
      ON CONFLICT(stripe_abo) DO UPDATE SET offre_le = excluded.offre_le`).bind(A.id, cl.id, 'actif', maintenant(), maintenant()).run();
    await noter(db, cl.id, null, 'abonnement', 'Voulait résilier, a gardé son abonnement Pack ' + A.nom + ' avec l\'offre ' + o.texte);
    return json({ ok: true, offre: o });
  }
  // résilier son abonnement (ou revenir sur sa résiliation) : après les 3 mois d'engagement, à la fin du mois en cours
  if ((m = chemin.match(/^\/abonnement\/(resilier|reprendre)$/)) && methode === 'POST') {
    const b = await corpsJson(req), resilier = m[1] === 'resilier';
    const A = (await abonnementsDuClient(db, cl.id)).find(a => a.id === String(b.abo || ''));
    if (!A) return json({ erreur: 'Abonnement introuvable.' }, 404);
    if (resilier && A.statut !== 'actif') return json({ erreur: A.statut === 'termine' ? 'Cet abonnement est déjà terminé.' : 'La résiliation est déjà enregistrée : l\'abonnement s\'arrête le ' + dateFr(A.fin_le) + '.' }, 409);
    if (resilier && !A.resiliable) return json({ erreur: 'Engagement de ' + ENGAGEMENT_MOIS + ' mois en cours : vous pourrez résilier à partir du ' + dateFr(A.resiliable_des) + '.' }, 409);
    if (!resilier && A.statut !== 'resiliation') return json({ erreur: 'Cet abonnement n\'est pas en cours de résiliation.' }, 409);
    if (!env.STRIPE_SECRET) return json({ erreur: 'Le paiement n\'est pas encore branché : écrivez-nous sur WhatsApp.' }, 503);
    let s;
    try {
      s = await appelStripe(env, 'subscriptions/' + encodeURIComponent(A.id), { cancel_at_period_end: resilier ? 'true' : 'false' });
      // une fin programmée par date (cancel_at, posée par Stripe ou par le portail) s'efface à part
      if (!resilier && s.cancel_at) s = await appelStripe(env, 'subscriptions/' + encodeURIComponent(A.id), { cancel_at: '' });
    }
    catch (e) { return json({ erreur: 'Stripe n\'a pas pu enregistrer la demande (' + e.message + '). Écrivez-nous sur WhatsApp.' }, 502); }
    const e = await majAbonnement(db, cl.id, s);
    await noter(db, cl.id, null, 'abonnement', resilier ? 'Abonnement Pack ' + A.nom + ' résilié : il s\'arrête le ' + dateFr(e.fin_le) + ', sans autre prélèvement'
      : 'Résiliation annulée : l\'abonnement Pack ' + A.nom + ' continue');
    return json({ ok: true, statut: e.statut, fin_le: e.fin_le });
  }
  if (chemin === '/moi' && methode === 'PATCH') {
    const b = await corpsJson(req);
    if ('photo' in b) {
      // une petite image carrée, réduite dans le navigateur (256 px) ; vide = retirer la photo
      const ph = String(b.photo || '');
      if (ph && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(ph)) return json({ erreur: 'Image non reconnue (JPG, PNG ou WebP).' }, 400);
      if (ph.length > 400000) return json({ erreur: 'Image trop lourde.' }, 413);
      await db.prepare('UPDATE clients SET photo = ?, photo_le = ? WHERE id = ?').bind(ph || null, ph ? maintenant() : null, cl.id).run();
      if (!Object.keys(b).some(k => k !== 'photo')) return json({ ok: true });
    }
    const champs = ['marque', 'contact', 'email', 'telephone', 'site'].filter(k => k in b);
    if ('marque' in b && !propre(b.marque, 80)) return json({ erreur: 'Le nom de la marque est obligatoire.' }, 400);
    if ('email' in b) {
      const email = propre(b.email, 160).toLowerCase();
      if (!emailValide(email)) return json({ erreur: 'Adresse email invalide.' }, 400);
      if (await db.prepare('SELECT id FROM clients WHERE lower(email) = ? AND id != ?').bind(email, cl.id).first()) return json({ erreur: 'Cette adresse est déjà utilisée par un autre compte.' }, 409);
    }
    if (!champs.length) return json({ ok: true });
    await db.prepare('UPDATE clients SET ' + champs.map(k => k + ' = ?').join(', ') + ' WHERE id = ?')
      .bind(...champs.map(k => k === 'email' ? propre(b[k], 160).toLowerCase() : propre(b[k], k === 'marque' || k === 'contact' ? 80 : 160)), cl.id).run();
    await noter(db, cl.id, null, 'profil', 'Profil mis à jour');
    return json({ ok: true });
  }

  // payer une commande : Stripe Checkout, au montant calculé ici
  if (chemin === '/paiement' && methode === 'POST') {
    if (/^c_demo_/.test(cl.id)) return json({ erreur: 'Client de démonstration : le paiement est désactivé.' }, 403);
    if (!env.STRIPE_SECRET) return json({ erreur: 'Le paiement en ligne arrive bientôt. Écrivez-nous sur WhatsApp pour commander.' }, 503);
    const b = await corpsJson(req);
    const d = devis(String(b.pack || ''), b.formule, b.nb_creas, Array.isArray(b.options) ? b.options.map(String) : []);
    const p = sessionStripe(d, { client: cl, succes: url.origin + '/client/#/merci', annule: url.origin + '/client/#/commander' });
    // paiement dans la page du portail (Stripe intégré) quand la clé publique est là
    const integre = false;   // la page de paiement Stripe s'ouvre (choix de Kreative)
    if (integre) { p.ui_mode = 'embedded'; p.return_url = url.origin + '/client/?paiement=ok'; delete p.success_url; delete p.cancel_url; }
    try {
      const s = await appelStripe(env, 'checkout/sessions', p);
      if (!b.prepare) await noter(db, cl.id, null, 'paiement', 'Paiement ouvert · ' + d.libelle + ' · ' + d.total + ' €');
      return json({ url: s.url || null, client_secret: integre ? s.client_secret : null, total: d.total });
    } catch (e) { return json({ erreur: 'Stripe : ' + e.message }, 502); }
  }

  // valider la livraison, puis l'avis Trustpilot
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9_]+)\/(valider|avis)$/)) && methode === 'POST') {
    const k = await db.prepare('SELECT * FROM commandes WHERE id = ? AND client_id = ?').bind(m[1], cl.id).first();
    if (!k) return json({ erreur: 'Commande introuvable' }, 404);
    if (m[2] === 'valider') {
      if (!['livre', 'revisions'].includes(k.statut)) return json({ erreur: 'Cette commande ne peut pas encore être validée.' }, 409);
      if (await partiesRestantes(env, db, k)) return json({ erreur: 'La suite de votre commande arrive bientôt : vous pourrez tout valider à la dernière livraison.' }, 409);
      await db.prepare("UPDATE commandes SET statut = 'valide', valide_le = ? WHERE id = ?").bind(maintenant(), k.id).run();
      await noter(db, cl.id, k.id, 'valide', 'Créatives validées · projet terminé');
      return json({ ok: true });
    }
    const b = await corpsJson(req);
    if (b.action === 'ecrit') {
      await db.prepare('UPDATE commandes SET avis_le = COALESCE(avis_le, ?) WHERE id = ?').bind(maintenant(), k.id).run();
      if (!k.avis_le) await noter(db, cl.id, k.id, 'avis', 'Merci pour votre avis Trustpilot');
    } else await db.prepare('UPDATE commandes SET avis_ignore_le = ? WHERE id = ?').bind(maintenant(), k.id).run();
    return json({ ok: true });
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ============================================================
//  DÉMONSTRATION
//  Des clients fictifs (emails @example.com) à chaque étape du parcours,
//  reliés aux dossiers TEST_DEMO_* du dépôt. Ils se repèrent à leur
//  identifiant (c_demo_, k_demo_, f_demo_) et partent d'un clic.
//  Rien n'est envoyé : ni email, ni Stripe, ni Telegram.
// ============================================================
async function creerDemo(db, env) {
  await retirerDemo(db, env);
  const J = 864e5, now = maintenant();
  const C = [
    ['lina', 'Lina Mode', 'Lina Moreau', [['starter', 'unique', 6, 280, null, 'brief', 1, null]], 'Commande payée, brief pas encore envoyé'],
    ['lumen', 'Maison Lumen', 'Hugo Lambert', [['growth', 'unique', 12, 490, 'TEST_DEMO_LUMEN', 'production', 2, null, 'variations:1']], 'Brief reçu, fiche à remplir (avec 1 variation de texte)'],
    ['sable', 'Atelier Sable', 'Clara Petit', [['starter', 'unique', 6, 280, 'TEST_DEMO_SABLE', 'production', 4, null]], 'Fiche en retard'],
    ['nordik', 'Nordik Café', 'Erik Dahl', [['custom', 'unique', 40, 1360, 'TEST_DEMO_NORDIK', 'production', 6, null]], 'Sur-mesure en 2 livraisons, brief de la livraison 2 reçu'],
    ['velvo', 'Velvo', 'Sami Benali', [['scale', 'unique', 24, 890, 'TEST_DEMO_VELVO', 'production', 5, null, 'express,variations:2']], 'Chez la designer, en retard (express, 2 variations de texte)'],
    ['oria', 'Oria Skin', 'Inès Garcia', [['growth', 'mensuel', 12, 420, 'TEST_DEMO_ORIA', 'production', 3, null]], 'Livré par la designer, à envoyer au client'],
    ['pulse', 'Pulse Studio', 'Noah Martin', [['growth', 'unique', 12, 490, 'TEST_DEMO_PULSE', 'livre', 8, null]], 'Livré, le client doit valider'],
    ['brume', 'Brume Paris', 'Léa Roux', [['scale', 'unique', 24, 890, 'TEST_DEMO_BRUME', 'revisions', 10, null]], 'Retouches en cours'],
    ['kora', 'Kora Food', 'Yanis Haddad', [['growth', 'mensuel', 12, 420, null, 'valide', 34, 'avis'], ['growth', 'mensuel', 12, 420, 'TEST_DEMO_KORA', 'production', 3, null]], 'Abonnement : mois précédent validé, brief du mois reçu']
  ];
  let n = 0, nb = 0;
  for (const [slug, marque, contact, cmds, note] of C) {
    const id = 'c_demo_' + slug;
    await db.prepare('INSERT INTO clients (id, marque, contact, email, site, jeton, notes, cree_le, vu_le) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, marque + ' (démo)', contact, 'demo-' + slug + '@example.com', 'https://example.com', aleatoire(32), 'Client de démonstration : ' + note, now - 40 * J, now - J).run();
    await db.prepare('INSERT INTO activite (client_id, type, texte, le) VALUES (?,?,?,?)').bind(id, 'client', 'Espace client créé', now - 40 * J).run();
    for (const [pack, formule, creas, prix, dossier, statut, ilya, extra, options] of cmds) {
      n++;
      const k = 'k_demo_' + slug + '_' + n, cree = now - ilya * J, brief = statut === 'brief' ? null : cree + J;
      const livre = ['livre', 'revisions', 'valide'].includes(statut) ? cree + 3 * J : null;
      await db.prepare(`INSERT INTO commandes (id, ref, client_id, pack, formule, nb_creas, prix, dossier, statut, cree_le, brief_le, livre_le, valide_le, avis_le, options)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(k, 'DEMO-' + n, id, pack, formule, creas, prix, dossier, statut, cree, brief, livre,
          statut === 'valide' ? cree + 5 * J : null, extra === 'avis' ? cree + 5 * J : null, options || null).run();
      const act = [['commande', 'Paiement reçu, commande confirmée', cree]];
      if (brief) act.push(['brief', 'Brief reçu, production lancée', brief]);
      if (livre) act.push(['livre', 'Vos créatives sont livrées', livre]);
      if (statut === 'revisions') act.push(['revisions', 'Retouches en cours', livre + J]);
      if (statut === 'valide') act.push(['valide', 'Créatives validées · projet terminé', cree + 5 * J]);
      for (const [type, texte, le] of act) await db.prepare('INSERT INTO activite (client_id, commande_id, type, texte, le) VALUES (?,?,?,?,?)').bind(id, k, type, texte, le).run();
      nb++;
      await db.prepare('INSERT INTO factures (id, client_id, commande_id, numero, montant, montant_ht, statut, emise_le, payee_le, source, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind('f_demo_' + n, id, k, 'DEMO-2026-' + String(nb).padStart(3, '0'), prix, prix, 'payee', cree, cree, 'demo', now).run();
    }
  }
  await livraisonsDemo(db, now);
  return { ok: true, clients: C.length, commandes: n };
}
// des livraisons de démonstration (les images viennent du dépôt) : à vérifier, chez le client, retouches
async function livraisonsDemo(db, now) {
  const J = 864e5, H = 36e5, F = [['1x1', 'STANDARD'], ['4x5', 'FEED'], ['9x16', 'REELS']];
  const L = [['oria', 'TEST_DEMO_ORIA', 1, 'a_verifier', 5 * H, null], ['pulse', 'TEST_DEMO_PULSE', 1, 'envoyee', 2 * J, now - 2 * J],
    ['brume', 'TEST_DEMO_BRUME', 1, 'review_terminee', 7 * J, now - 6 * J], ['brume', 'TEST_DEMO_BRUME', 2, 'a_verifier', 3 * H, null]];
  const req = [];
  for (const [slug, dossier, v, statut, ilya, envoye] of L) {
    const id = 'l_demo_' + slug + '_' + v;
    req.push(db.prepare('INSERT INTO livraisons (id, dossier, version, statut, note_designer, depose_le, envoye_le, review_le, cree_le) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, dossier, v, statut, v > 1 ? 'Retouches faites sur les visuels 02 et 04.' : null, now - ilya, envoye, statut === 'review_terminee' ? now - 5 * J : null, now - ilya));
    for (let n = 1; n <= 5; n++) for (const [format, mot] of F) {
      const fid = 'fi_demo_' + slug + v + '_' + format + n, nom = slug.toUpperCase() + '_' + mot + '_0' + n + '.jpg';
      req.push(db.prepare('INSERT INTO fichiers (id, livraison_id, format, nom, cle, type, taille, largeur, hauteur, approuve_le, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(fid, id, format, nom, 'depot:TURNLY_10_bc5e/creas/AD0' + n + '/visuel.jpg', 'image/jpeg', 1200000 + n * 90000, 1080, format === '1x1' ? 1080 : format === '4x5' ? 1350 : 1920,
          slug === 'pulse' && n === 1 ? now - J : statut === 'review_terminee' && n !== 2 && n !== 4 ? now - 5 * J : null, now - ilya));
    }
  }
  const com = (fid, liv, auteur, role, texte, forme, couleur, interne, le) => req.push(db.prepare('INSERT INTO commentaires (fichier_id, livraison_id, auteur, role, texte, forme, couleur, interne, cree_le) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(fid, liv, auteur, role, texte, forme ? JSON.stringify(forme) : null, couleur, interne, le));
  com('fi_demo_brume1_1x12', 'l_demo_brume_1', 'Léa Roux', 'client', 'Le logo est trop petit, on peut le passer en haut à gauche ?', { t: 'rect', x1: .62, y1: .05, x2: .95, y2: .2 }, '#e5484d', 0, now - 5 * J);
  com('fi_demo_brume1_4x54', 'l_demo_brume_1', 'Léa Roux', 'client', 'Remplacer « dès 29 € » par « à partir de 29 € ».', { t: 'fleche', x1: .2, y1: .8, x2: .45, y2: .62 }, '#f5a524', 0, now - 5 * J);
  com('fi_demo_pulse1_1x13', 'l_demo_pulse_1', 'Noah Martin', 'client', 'Top, juste un peu plus de contraste sur le titre.', { t: 'cercle', x1: .25, y1: .1, x2: .75, y2: .32 }, '#4d94ff', 0, now - J);
  com('fi_demo_oria1_9x162', 'l_demo_oria_1', 'Dario', 'admin', 'Texte trop près du bas : zone de sécurité Reels.', { t: 'rect', x1: .08, y1: .82, x2: .92, y2: .97 }, '#e5484d', 1, now - 3 * H);
  await db.batch(req);
}
async function retirerDemo(db, env) {
  if (env) await baseLiv(env);
  const r = await db.prepare("SELECT COUNT(*) AS n FROM clients WHERE id LIKE 'c_demo_%'").first();
  await db.batch([
    db.prepare("DELETE FROM activite WHERE client_id LIKE 'c_demo_%'"),
    db.prepare("DELETE FROM factures WHERE id LIKE 'f_demo_%' OR client_id LIKE 'c_demo_%'"),
    db.prepare("DELETE FROM commandes WHERE id LIKE 'k_demo_%' OR client_id LIKE 'c_demo_%'"),
    db.prepare("DELETE FROM clients WHERE id LIKE 'c_demo_%'")]);
  if (env) await db.batch([
    db.prepare("DELETE FROM commentaires WHERE livraison_id LIKE 'l_demo_%' OR livraison_id IN (SELECT id FROM livraisons WHERE dossier LIKE 'TEST_DEMO_%')"),
    db.prepare("DELETE FROM fichiers WHERE id LIKE 'fi_demo_%' OR livraison_id IN (SELECT id FROM livraisons WHERE dossier LIKE 'TEST_DEMO_%')"),
    db.prepare("DELETE FROM livraisons WHERE id LIKE 'l_demo_%' OR dossier LIKE 'TEST_DEMO_%'"),
    db.prepare("DELETE FROM prod_etapes WHERE dossier LIKE 'TEST_DEMO_%'")]);
  return { ok: true, retires: (r && r.n) || 0 };
}

// la photo de profil d'un client, stockée en data URL dans la base
function imagePhoto(ph) {
  const m = ph && String(ph).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response('Pas de photo', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const bin = atob(m[2]), o = new Uint8Array(bin.length);
  for (let n = 0; n < bin.length; n++) o[n] = bin.charCodeAt(n);
  return new Response(o, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}

// ---------- créer une commande (admin, paiement Stripe, renouvellement mensuel) ----------
async function creerCommande(db, o) {
  const id = 'k_' + aleatoire(10);
  let ref = '';
  // le numéro suit le dernier ; si deux commandes partent à la même seconde, on réessaie
  for (let essai = 0; essai < 5; essai++) {
    const max = await db.prepare("SELECT MAX(CAST(ref AS INTEGER)) AS n FROM commandes WHERE ref NOT LIKE 'DEMO%'").first();
    ref = String(Math.max(1000, (max && max.n) || 1000) + 1 + essai);
    try {
      await db.prepare(`INSERT INTO commandes (id, ref, client_id, pack, formule, nb_creas, prix, dossier, statut, cree_le, brief_le, options, stripe_session, stripe_abo, stripe_facture)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, ref, o.client_id, o.pack, o.formule, o.nb, o.prix, o.dossier || null, o.dossier ? 'production' : 'brief', maintenant(), o.dossier ? maintenant() : null,
          o.options && o.options.length ? o.options.join(',') : null, o.stripe_session || null, o.stripe_abo || null, o.stripe_facture || null).run();
      break;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message)) || /stripe_session/.test(String(e && e.message)) || essai === 4) throw e; }
  }
  const P = PACKS[o.pack] || PACKS.growth;
  await noter(db, o.client_id, id, 'commande', (o.texte || 'Commande confirmée') + ' · Pack ' + P.nom + ' · ' + o.nb + ' créatives');
  if (o.dossier) await noter(db, o.client_id, id, 'brief', 'Brief reçu, production lancée');
  return { id, ref };
}

// ---------- API admin ----------
// le prix et le nombre de créatives des packs Starter, Growth et Scale sont fixes ;
// seul le pack Custom se règle à la main
function prixPack(pack, formule, b) {
  const P = PACKS[pack] || PACKS.growth;
  if (pack !== 'custom') return { nb: P.creas, prix: formule === 'mensuel' ? P.mensuel : P.unique };
  const nb = Number(b.nb_creas), prix = b.prix === '' || b.prix == null ? null : Number(b.prix);
  return { nb: Number.isFinite(nb) && nb > 0 ? Math.round(nb) : P.creas, prix: Number.isFinite(prix) ? prix : null };
}
async function apiAdmin(req, env, ctx, url, chemin, methode) {
  const db = await base(env);
  const b = methode === 'GET' ? {} : await corpsJson(req);
  let m;
  if (chemin === '/wimmov' || chemin.startsWith('/wimmov/')) return apiWimmovAdmin(env, ctx, url, chemin.slice('/wimmov'.length), methode, b);

  // une notification aux clients qui ont l'app (une promo, une nouvelle) ou à un seul client
  if (chemin === '/notifier' && methode === 'POST') {
    const titre = propre(b.titre, 80), texte = propre(b.texte, 240), lien = /^\/client\//.test(String(b.url || '')) ? propre(b.url, 200) : '/client/';
    if (!titre || !texte) return json({ erreur: 'Écrivez un titre et un message.' }, 400);
    const ldb = await baseLiv(env);
    // tous ceux qui ont activé les notifications, un client (sa fiche), ou une sélection
    const choix = b.client ? [String(b.client)] : Array.isArray(b.clients) ? [...new Set(b.clients.map(String).filter(x => /^c_[A-Za-z0-9_]+$/.test(x)))].slice(0, 500) : null;
    if (choix && !choix.length) return json({ erreur: 'Choisissez au moins un client.' }, 400);
    const { results } = await ldb.prepare('SELECT DISTINCT client_id FROM push_abos').all();
    const cibles = results.map(r => r.client_id).filter(id => !choix || choix.includes(id));
    if (b.client && !cibles.length) cibles.push(String(b.client));
    let appareils = 0, touches = 0;
    for (const id of cibles) { const n = await notifier(env, id, { titre, texte, url: lien }); appareils += n; if (n) touches++; }
    return json({ ok: true, clients: touches, appareils, message: 'Notification envoyée à ' + touches + ' client' + (touches > 1 ? 's' : '') + '.' });
  }
  if (chemin === '/clients' && methode === 'GET') {
    await baseLiv(env);
    await synchroStatuts(db);
    const { results } = await db.prepare(`SELECT c.*, COUNT(k.id) AS nb_commandes, COALESCE(SUM(k.prix),0) AS total,
      MAX(k.cree_le) AS derniere_commande, SUM(CASE WHEN k.statut IN ('brief','production','livre','revisions') THEN 1 ELSE 0 END) AS en_cours,
      SUM(CASE WHEN k.statut = 'valide' AND k.avis_le IS NULL THEN 1 ELSE 0 END) AS sans_avis,
      MIN(CASE WHEN k.statut = 'brief' THEN k.cree_le END) AS brief_attendu_depuis, MAX(k.valide_le) AS derniere_validation,
      MAX(CASE WHEN k.formule = 'mensuel' THEN k.cree_le END) AS dernier_mensuel,
      (SELECT COUNT(*) FROM push_abos p WHERE p.client_id = c.id) AS notifs
      FROM clients c LEFT JOIN commandes k ON k.client_id = c.id AND k.statut != 'annule'
      GROUP BY c.id ORDER BY c.cree_le DESC`).all();
    return json(results.map(({ photo, ...c }) => ({ ...c, lien: lienAcces(url, c.jeton) })));
  }
  if (chemin === '/clients' && methode === 'POST') {
    const marque = propre(b.marque, 80), email = propre(b.email, 160).toLowerCase();
    if (!marque) return json({ erreur: 'Le nom de la marque est obligatoire.' }, 400);
    if (email && !emailValide(email)) return json({ erreur: 'Adresse email invalide.' }, 400);
    if (email && await db.prepare('SELECT id FROM clients WHERE lower(email) = ?').bind(email).first()) return json({ erreur: 'Un client existe déjà avec cet email.' }, 409);
    const id = 'c_' + aleatoire(10), jeton = aleatoire(32);
    await db.prepare('INSERT INTO clients (id, marque, contact, email, telephone, site, jeton, notes, cree_le) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, marque, propre(b.contact, 80), email || null, propre(b.telephone, 40), propre(b.site, 160), jeton, propre(b.notes, 2000), maintenant()).run();
    await noter(db, id, null, 'client', 'Espace client créé');
    return json({ id, lien: lienAcces(url, jeton) });
  }
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9_]+)\/photo$/)) && methode === 'GET') {
    const cl = await db.prepare('SELECT photo FROM clients WHERE id = ?').bind(m[1]).first();
    return imagePhoto(cl && cl.photo);
  }
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9_]+)$/))) {
    const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    if (methode === 'GET') {
      const commandes = await commandesDuClient(db, env, cl.id, true);
      const [{ results: activite }, { results: factures }] = await Promise.all([
        db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 30').bind(cl.id).all(),
        db.prepare('SELECT * FROM factures WHERE client_id = ? ORDER BY emise_le DESC').bind(cl.id).all()]);
      const { photo, ...sansPhoto } = cl;
      await baseLiv(env);
      const ab = await db.prepare('SELECT COUNT(*) AS n FROM push_abos WHERE client_id = ?').bind(cl.id).first();
      return json({ client: { ...sansPhoto, notifs: (ab && ab.n) || 0, lien: lienAcces(url, cl.jeton) }, commandes, activite, factures, abonnements: await abonnementsDuClient(db, cl.id) });
    }
    if (methode === 'PATCH') {
      const champs = ['marque', 'contact', 'email', 'telephone', 'site', 'statut', 'notes'].filter(k => k in b);
      if (!champs.length) return json({ ok: true });
      if ('email' in b && b.email && !emailValide(propre(b.email))) return json({ erreur: 'Adresse email invalide.' }, 400);
      if ('email' in b && b.email && await db.prepare('SELECT id FROM clients WHERE lower(email) = ? AND id != ?').bind(propre(b.email, 160).toLowerCase(), cl.id).first())
        return json({ erreur: 'Un autre client utilise déjà cet email.' }, 409);
      await db.prepare('UPDATE clients SET ' + champs.map(k => k + ' = ?').join(', ') + ' WHERE id = ?')
        .bind(...champs.map(k => k === 'email' ? (propre(b[k], 160).toLowerCase() || null) : propre(b[k], k === 'notes' ? 2000 : 160)), cl.id).run();
      return json({ ok: true });
    }
    if (methode === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM commandes WHERE client_id = ?').bind(cl.id), db.prepare('DELETE FROM activite WHERE client_id = ?').bind(cl.id),
        db.prepare('UPDATE factures SET client_id = NULL, commande_id = NULL WHERE client_id = ?').bind(cl.id),
        db.prepare('DELETE FROM clients WHERE id = ?').bind(cl.id)]);
      return json({ ok: true });
    }
  }
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9_]+)\/(nouveau-lien|envoyer-lien)$/)) && methode === 'POST') {
    const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    if (m[2] === 'nouveau-lien') {
      const jeton = aleatoire(32);
      await db.prepare('UPDATE clients SET jeton = ? WHERE id = ?').bind(jeton, cl.id).run();
      await noter(db, cl.id, null, 'lien', 'Nouveau lien d\'accès (l\'ancien ne marche plus)');
      return json({ lien: lienAcces(url, jeton) });
    }
    if (!cl.email) return json({ erreur: 'Ce client n\'a pas d\'email.' }, 400);
    if (estWimmov(cl)) { const rw = await envoyerAccesWimmov(env, url, cl, [cl.email].concat(await emailsWimmov(env))); if (rw.ok) await noter(db, cl.id, null, 'lien', 'Lien de l\'espace envoyé'); return json(rw, rw.ok ? 200 : 502); }
    const r = await envoyerEmail(env, emailAcces(url, cl, lienAcces(url, cl.jeton)));
    if (r.ok) await noter(db, cl.id, null, 'lien', 'Lien d\'accès envoyé par email');
    return json(r, r.ok ? 200 : 502);
  }

  if (chemin === '/commandes' && methode === 'GET') {
    await synchroStatuts(db);
    const { results } = await db.prepare(`SELECT k.*, c.marque, c.contact, c.email FROM commandes k JOIN clients c ON c.id = k.client_id
      ORDER BY k.cree_le DESC`).all();
    return json(results);
  }
  if (chemin === '/commandes' && methode === 'POST') {
    const cl = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(propre(b.client_id, 40)).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    const pack = PACKS[b.pack] ? b.pack : 'growth', formule = ['unique', 'mensuel'].includes(b.formule) ? b.formule : 'unique';
    const { nb, prix } = prixPack(pack, formule, b);
    return json(await creerCommande(db, { client_id: cl.id, pack, formule, nb, prix, dossier: propre(b.dossier, 60) || null }));
  }
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9_]+)$/))) {
    const k = await db.prepare('SELECT * FROM commandes WHERE id = ?').bind(m[1]).first();
    if (!k) return json({ erreur: 'Commande introuvable' }, 404);
    if (methode === 'PATCH') {
      if ('statut' in b && !STATUTS.includes(b.statut)) return json({ erreur: 'Statut inconnu' }, 400);
      const maj = {};
      for (const x of ['dossier', 'statut', 'deadline', 'notes']) if (x in b) maj[x] = x === 'deadline' ? (b[x] === '' || b[x] == null ? null : Number(b[x])) : (propre(b[x], 2000) || null);
      if (env.PUSH_TEST && 'cree_le' in b) maj.cree_le = Number(b.cree_le);   // banc de test seulement : remonter le temps
      // banc de test seulement : reculer les dates d'envoi des livraisons de la commande (le calendrier du Custom en part)
      if (env.PUSH_TEST && b.decaler_livraisons && k.dossier) { const p0 = k.dossier.replace(/_L\d+$/, ''); await (await baseLiv(env)).prepare('UPDATE livraisons SET envoye_le = envoye_le - ? WHERE envoye_le IS NOT NULL AND (dossier = ? OR dossier LIKE ?)').bind(Number(b.decaler_livraisons), p0, p0 + '_L%').run(); }
      // le brief rattrapé à la main (n8n n'a pas pu prévenir le portail) : ses réponses Fillout et son heure d'envoi
      if (Array.isArray(b.questions)) { const rep = briefPropre(b.questions); if (rep.length) maj.brief_json = JSON.stringify(rep); }
      if ('brief_le' in b && Number(b.brief_le) > 1.6e12 && Number(b.brief_le) <= maintenant() + 6e4) maj.brief_le = Math.round(Number(b.brief_le));
      if ('pack' in b || 'formule' in b || 'nb_creas' in b || 'prix' in b) {
        const pack = PACKS[b.pack] ? b.pack : k.pack, formule = ['unique', 'mensuel'].includes(b.formule) ? b.formule : k.formule;
        const p = prixPack(pack, formule, { nb_creas: 'nb_creas' in b ? b.nb_creas : k.nb_creas, prix: 'prix' in b ? b.prix : k.prix });
        Object.assign(maj, { pack, formule, nb_creas: p.nb, prix: p.prix });
      }
      const champs = Object.keys(maj);
      if (!champs.length) return json({ ok: true });
      await db.prepare('UPDATE commandes SET ' + champs.map(x => x + ' = ?').join(', ') + ' WHERE id = ?').bind(...champs.map(x => maj[x]), k.id).run();
      if (maj.dossier && !k.dossier) {
        await db.prepare("UPDATE commandes SET brief_le = COALESCE(brief_le, ?), statut = CASE WHEN statut = 'brief' THEN 'production' ELSE statut END WHERE id = ?").bind(maintenant(), k.id).run();
        await noter(db, k.client_id, k.id, 'brief', 'Brief reçu, production lancée');
      }
      if (maj.brief_le) await db.prepare("UPDATE activite SET le = ? WHERE commande_id = ? AND type = 'brief'").bind(maj.brief_le, k.id).run();
      if ('statut' in b && b.statut !== k.statut) {
        const textes = { livre: 'Vos créatives sont livrées', revisions: 'Retouches en cours', valide: 'Projet validé', production: 'Production en cours' };
        if (textes[b.statut]) await noter(db, k.client_id, k.id, b.statut, textes[b.statut]);
        if (b.statut === 'livre') await db.prepare('UPDATE commandes SET livre_le = COALESCE(livre_le, ?) WHERE id = ?').bind(maintenant(), k.id).run();
        if (b.statut === 'valide') await db.prepare('UPDATE commandes SET valide_le = COALESCE(valide_le, ?) WHERE id = ?').bind(maintenant(), k.id).run();
      }
      return json({ ok: true });
    }
    if (methode === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM commandes WHERE id = ?').bind(k.id), db.prepare('UPDATE factures SET commande_id = NULL WHERE commande_id = ?').bind(k.id)]);
      return json({ ok: true });
    }
  }

  // ---- factures (Stripe les crée seules ; ajout à la main en attendant) ----
  if (chemin === '/factures' && methode === 'GET') {
    const { results } = await db.prepare(`SELECT f.*, c.marque, k.ref, k.pack, k.formule, k.cree_le AS commande_le FROM factures f
      LEFT JOIN clients c ON c.id = f.client_id LEFT JOIN commandes k ON k.id = f.commande_id ORDER BY f.emise_le DESC`).all();
    return json({ factures: results, stripe: !!env.STRIPE_WEBHOOK_SECRET });
  }
  if (chemin === '/factures' && methode === 'POST') {
    const cl = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(propre(b.client_id, 40)).first();
    if (!cl) return json({ erreur: 'Choisissez un client.' }, 400);
    const montant = Number(String(b.montant || '').replace(',', '.'));
    if (!Number.isFinite(montant) || montant < 0) return json({ erreur: 'Montant invalide.' }, 400);
    const pdf = propre(b.pdf, 500);
    if (pdf && !/^https:\/\//.test(pdf)) return json({ erreur: 'Le lien du PDF doit commencer par https://' }, 400);
    const k = b.commande_id ? await db.prepare('SELECT id FROM commandes WHERE id = ? AND client_id = ?').bind(propre(b.commande_id, 40), cl.id).first() : null;
    const id = 'f_' + aleatoire(10), emise = Number(b.emise_le) || maintenant(), statut = ['payee', 'ouverte', 'impayee', 'annulee'].includes(b.statut) ? b.statut : 'payee';
    await db.prepare('INSERT INTO factures (id, client_id, commande_id, numero, montant, statut, emise_le, payee_le, pdf, source, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, cl.id, k ? k.id : null, propre(b.numero, 40) || null, montant, statut, emise, statut === 'payee' ? emise : null, pdf || null, 'manuel', maintenant()).run();
    await noter(db, cl.id, k ? k.id : null, 'facture', 'Facture ' + (propre(b.numero, 40) || '') + ' disponible');
    return json({ id });
  }
  if ((m = chemin.match(/^\/factures\/(f_[A-Za-z0-9_]+)$/))) {
    const f = await db.prepare('SELECT * FROM factures WHERE id = ?').bind(m[1]).first();
    if (!f) return json({ erreur: 'Facture introuvable' }, 404);
    if (methode === 'PATCH') {
      const maj = {};
      if ('client_id' in b) maj.client_id = (await db.prepare('SELECT id FROM clients WHERE id = ?').bind(propre(b.client_id, 40)).first() || {}).id || null;
      if ('commande_id' in b) maj.commande_id = b.commande_id ? ((await db.prepare('SELECT id FROM commandes WHERE id = ?').bind(propre(b.commande_id, 40)).first() || {}).id || null) : null;
      if ('statut' in b && ['payee', 'ouverte', 'impayee', 'annulee'].includes(b.statut)) maj.statut = b.statut;
      const champs = Object.keys(maj);
      if (champs.length) await db.prepare('UPDATE factures SET ' + champs.map(x => x + ' = ?').join(', ') + ' WHERE id = ?').bind(...champs.map(x => maj[x]), f.id).run();
      return json({ ok: true });
    }
    if (methode === 'DELETE') {
      // une facture Stripe rattachée à un client reste ; une facture Stripe orpheline (test, client supprimé) peut quitter le portail
      const orpheline = !f.client_id || !(await db.prepare('SELECT 1 AS ok FROM clients WHERE id = ?').bind(f.client_id).first());
      if (f.source === 'stripe' && !orpheline) return json({ erreur: 'Une facture Stripe rattachée à un client se gère dans Stripe.' }, 409);
      await db.prepare('DELETE FROM factures WHERE id = ?').bind(f.id).run();
      return json({ ok: true });
    }
  }

  // ---- données de démonstration : un client à chaque étape, pour tout voir ----
  if (chemin === '/demo' && methode === 'POST') return json(await creerDemo(db, env));
  if (chemin === '/demo' && methode === 'DELETE') return json(await retirerDemo(db, env));

  if (chemin === '/equipe' && methode === 'GET') {
    const ldb = await baseLiv(env);
    const { results: V } = await ldb.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'vu_equipe:%'").all();
    const vu = Object.fromEntries(V.map(r => [r.cle.slice(10), Number(r.valeur) || 0]));
    return json(personnes(env).map(x => ({ nom: x.nom, role: x.role, espace: ACCUEILS[x.role], vu_le: vu[x.nom] || null })));
  }
  if (chemin === '/resume' && methode === 'GET') {
    await synchroStatuts(db);
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM clients) AS clients,
      (SELECT COUNT(*) FROM commandes WHERE statut IN ('brief','production','livre','revisions')) AS en_cours,
      (SELECT COUNT(*) FROM commandes WHERE formule = 'mensuel' AND statut != 'annule') AS mensuels,
      (SELECT COALESCE(SUM(prix),0) FROM commandes WHERE statut != 'annule' AND cree_le > ?) AS ca_30j,
      (SELECT COALESCE(SUM(montant),0) FROM factures WHERE statut = 'payee' AND emise_le > ?) AS encaisse_30j,
      (SELECT COUNT(*) FROM factures WHERE statut IN ('ouverte','impayee')) AS impayees,
      (SELECT COUNT(*) FROM clients WHERE id LIKE 'c_demo_%') AS demo`).bind(maintenant() - 30 * 864e5, maintenant() - 30 * 864e5).first();
    return json({ ...r, packs: PACKS, custom: CUSTOM, stripe: !!env.STRIPE_WEBHOOK_SECRET, paiement: !!env.STRIPE_SECRET });
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ============================================================
//  LIVRAISONS : la designer dépose ses fichiers dans le portail,
//  Kreative vérifie (envoie au client ou renvoie à la designer),
//  le client fait sa review : chaque créative, chaque format,
//  des commentaires et des annotations, approuver, tout télécharger.
//  Les fichiers vont dans le stockage R2 lié au Worker sous le nom
//  FICHIERS. Statuts d'une version :
//    brouillon → a_verifier → envoyee → approuvee
//                          ↘ a_corriger        ↘ review_terminee (retouches)
// ============================================================
const N8N_LIVRAISON = 'https://n8n.srv1536015.hstgr.cloud/webhook/livraison-designer';
// la fiche créas, envoyée depuis le portail : le Worker ajoute le code Kreative (secret CODE_FICHE)
const N8N_FICHE = 'https://n8n.srv1536015.hstgr.cloud/webhook/fiche-creas';
const FORMATS_OK = ['1x1', '4x5', '9x16', 'autre'];
const VISIBLES_CLIENT = ['envoyee', 'review_terminee', 'approuvee'];
const baseDossier = d => String(d || '').replace(/_L\d+$/, '');
let LIV_PRETE = false;
async function baseLiv(env) {
  const db = await base(env);
  if (!LIV_PRETE) {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS livraisons (id TEXT PRIMARY KEY, dossier TEXT NOT NULL, version INTEGER, statut TEXT,
        note_designer TEXT, note_kreative TEXT, depose_le INTEGER, verifie_le INTEGER, envoye_le INTEGER, review_le INTEGER, cree_le INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS fichiers (id TEXT PRIMARY KEY, livraison_id TEXT NOT NULL, format TEXT, nom TEXT, cle TEXT, mini TEXT,
        type TEXT, taille INTEGER, largeur INTEGER, hauteur INTEGER, approuve_le INTEGER, cree_le INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS commentaires (id INTEGER PRIMARY KEY AUTOINCREMENT, fichier_id TEXT NOT NULL, livraison_id TEXT,
        auteur TEXT, role TEXT, texte TEXT, forme TEXT, couleur TEXT, interne INTEGER DEFAULT 0, cree_le INTEGER)`),
      db.prepare('CREATE TABLE IF NOT EXISTS prod_etapes (dossier TEXT PRIMARY KEY, etape TEXT, le INTEGER, par TEXT)'),
      db.prepare('CREATE TABLE IF NOT EXISTS push_abos (endpoint TEXT PRIMARY KEY, client_id TEXT, cree_le INTEGER)'),
      db.prepare('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT, titre TEXT, texte TEXT, url TEXT, cree_le INTEGER)'),
      db.prepare('CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT)'),
      db.prepare('CREATE TABLE IF NOT EXISTS retours (id INTEGER PRIMARY KEY AUTOINCREMENT, apres TEXT, suivante TEXT, commande_id TEXT, client_id TEXT, reponses TEXT, recu_le INTEGER)'),
      db.prepare('CREATE INDEX IF NOT EXISTS i_liv_dossier ON livraisons(dossier)'),
      db.prepare('CREATE INDEX IF NOT EXISTS i_fic_liv ON fichiers(livraison_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS i_com_fic ON commentaires(fichier_id)')]);
    // les retouches : qui doit agir en premier (le stratégiste pour les textes, la designer pour le visuel)
    for (const col of ['retouche TEXT', 'retouche_le INTEGER']) { try { await db.prepare('ALTER TABLE livraisons ADD COLUMN ' + col).run(); } catch (e) {} }
    // une seule version N par projet, même si deux dépôts partent en même temps
    try { await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS u_liv_version ON livraisons(dossier, version)').run(); } catch (e) {}
    LIV_PRETE = true;
  }
  return db;
}
const formeJson = f => { try { return f ? JSON.parse(f) : null; } catch (e) { return null; } };
async function detailLivraison(db, l, client) {
  const [{ results: F }, { results: C }] = await Promise.all([
    db.prepare('SELECT * FROM fichiers WHERE livraison_id = ? ORDER BY format, nom').bind(l.id).all(),
    db.prepare('SELECT * FROM commentaires WHERE livraison_id = ?' + (client ? ' AND interne = 0' : '') + ' ORDER BY cree_le').bind(l.id).all()]);
  const sortie = { id: l.id, dossier: l.dossier, version: l.version, statut: l.statut, depose_le: l.depose_le, envoye_le: l.envoye_le, review_le: l.review_le,
    retouche: client ? undefined : (['a_corriger', 'review_terminee'].includes(l.statut) ? (l.retouche || 'designer') : null),
    fichiers: F.map(f => ({ id: f.id, format: f.format, nom: f.nom, type: f.type, taille: f.taille, largeur: f.largeur, hauteur: f.hauteur, approuve_le: f.approuve_le,
      url: '/fichiers/' + f.id, mini: '/fichiers/' + f.id + (f.mini ? '?mini=1' : ''),
      commentaires: C.filter(c => c.fichier_id === f.id).map(c => ({ id: c.id, auteur: c.auteur, role: c.role, texte: c.texte, forme: formeJson(c.forme), couleur: c.couleur, interne: !!c.interne, cree_le: c.cree_le })) })) };
  if (!client) { sortie.note_designer = l.note_designer; sortie.note_kreative = l.note_kreative; sortie.verifie_le = l.verifie_le; }
  return sortie;
}
// la commande (et son client) d'un dossier de livraison : « PODMAX_10_cc34 » ou « NORDIK_10_ab12_L2 »
async function commandeDuDossier(db, dossier) {
  return db.prepare(`SELECT k.*, c.marque, c.contact, c.email, c.jeton FROM commandes k JOIN clients c ON c.id = k.client_id
    WHERE k.dossier = ? OR k.dossier = ? ORDER BY k.cree_le DESC LIMIT 1`).bind(dossier, baseDossier(dossier)).first();
}
// une version visible par ce client ? (son dossier, et déjà envoyée par Kreative)
async function livraisonDuClient(db, cl, id) {
  const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(id).first();
  if (!l || !VISIBLES_CLIENT.includes(l.statut)) return null;
  const k = await db.prepare('SELECT id FROM commandes WHERE client_id = ? AND (dossier = ? OR dossier = ?)').bind(cl.id, l.dossier, baseDossier(l.dossier)).first();
  return k ? l : null;
}
// la dernière livraison d'un projet en plusieurs fois ? (lu dans le dépôt)
async function estDerniereLivraison(env, dossier) {
  const d = await lireJsonDepot(env, dossier + '/donnees.json');
  const l = d && d.livraison;
  return !(l && l.sur > 1 && l.n < l.sur);
}

// renvoyer une version : à la designer, ou d'abord au stratégiste (textes)
async function renvoyerVersion(db, l, pour, note) {
  const now = maintenant();
  const ch = await db.prepare("UPDATE livraisons SET statut = 'a_corriger', note_kreative = ?, verifie_le = ?, retouche = ?, retouche_le = ? WHERE id = ? AND statut = 'a_verifier'")
    .bind(note || null, now, pour, now, l.id).run();
  if (!ch.meta || ch.meta.changes !== 1) return false;
  await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
  return true;
}
// envoyer une version au client : la commande passe « livré », le client reçoit l'email
async function envoyerAuClient(env, ctx, url, db, l) {
  const now = maintenant();
  // une seule fois, même si deux clics (ou un clic et un glisser) arrivent en même temps
  const ch = await db.prepare("UPDATE livraisons SET statut = 'envoyee', envoye_le = ?, verifie_le = ?, retouche = NULL WHERE id = ? AND statut = 'a_verifier'").bind(now, now, l.id).run();
  if (!ch.meta || ch.meta.changes !== 1) return false;
  await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
  const k = await commandeDuDossier(db, l.dossier);
  if (!k) return true;
  const finale = await estDerniereLivraison(env, l.dossier);
  if (finale && !['valide', 'annule'].includes(k.statut)) await db.prepare("UPDATE commandes SET statut = 'livre', livre_le = COALESCE(livre_le, ?) WHERE id = ?").bind(now, k.id).run();
  // une partie (1/2…) renvoyée après retouches : la commande repart en production
  if (!finale && k.statut === 'revisions') await db.prepare("UPDATE commandes SET statut = 'production' WHERE id = ?").bind(k.id).run();
  await noter(db, k.client_id, k.id, 'livre', l.version > 1 ? 'Nouvelle version de vos créatives (version ' + l.version + ')' : 'Vos créatives sont livrées');
  // une partie d'un projet livré en plusieurs fois : « Livraison 1 sur 4 disponible », et le brief de la suivante est
  // programmé à sa date (voir briefSuivantLe) : il partira seul, au bon moment
  const partie = await partieDe(env, l.dossier), v2 = l.version > 1;
  if (partie && !v2 && partie.n < partie.sur) {
    // au moins une heure après la livraison, même si la date est déjà passée : jamais dans le même message
    const l1 = partie.n === 1 ? now : await premiereRecue(env, l.dossier.replace(/_L\d+$/, ''));
    const le = Math.max(briefSuivantLe(k, partie.n + 1, partie.sur, now, l1), now + 36e5);
    await db.prepare(`INSERT OR IGNORE INTO rappels (cle, client_id, commande_id, type, n, sur, dossier, le) VALUES (?,?,?,?,?,?,?,?)`)
      .bind('brief:' + l.dossier, k.client_id, k.id, 'brief_suivant', partie.n + 1, partie.sur, l.dossier, le).run();
  }
  const titre = v2 ? 'Vos créatives modifiées' : partie ? 'Livraison ' + partie.n + ' sur ' + partie.sur + ' disponible' : 'Vos créatives sont prêtes';
  const texte = v2 ? 'Les retouches demandées ont été appliquées. La nouvelle version est disponible dans votre espace.'
    : partie ? 'Les créatives de votre livraison ' + partie.n + ' sont disponibles dans votre espace Kreative.' : 'Vos nouvelles créatives sont disponibles dans votre espace Kreative.';
  const notif = notifier(env, k.client_id, { titre, texte, url: '/client/#/projets/' + k.id + '/creatives' });
  if (ctx && ctx.waitUntil) ctx.waitUntil(notif); else await notif;
  if (k.email && k.jeton && !/^TEST_DEMO_/.test(l.dossier)) {
    const prenom = String(k.contact || '').trim().split(/\s+/)[0], lien = lienAcces(url, k.jeton);
    const envoi = envoyerEmail(env, { type: 'creatives', a: k.email, marque: k.marque, contact: k.contact || '', lien, sujet: k.marque + ' · ' + titre,
      html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
        paragraphes: v2 ? ['Les retouches demandées ont été appliquées. Si d\'autres ajustements sont nécessaires, indiquez-les directement sur les créatives concernées, ou validez le projet en un clic.']
          : ['Si des ajustements sont nécessaires, indiquez-les directement sur les créatives concernées.'],
        bouton: [v2 ? 'Voir la nouvelle version' : 'Voir mes créatives', lien] }) });
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
  }
  return true;
}
// un projet en plusieurs livraisons dont la dernière n'est pas encore chez le client ?
async function partiesRestantes(env, db, k) {
  if (!k || !k.dossier) return false;
  const base = baseDossier(k.dossier);
  let d1 = await lireJsonDepot(env, k.dossier + '/donnees.json');
  if (!(d1 && d1.livraison)) d1 = await lireJsonDepot(env, base + '_L1/donnees.json');
  const l = d1 && d1.livraison;
  if (!l || !(l.sur > 1)) return false;
  const fin = await db.prepare("SELECT 1 AS ok FROM livraisons WHERE dossier = ? AND statut IN ('envoyee','review_terminee','approuvee') LIMIT 1").bind(base + '_L' + l.sur).first();
  return !fin;
}
// les retours du client parlent-ils des textes ? Alors le stratégiste corrige d'abord, la designer ensuite.
// Un commentaire compte pour les textes quand il parle de mots (citation, remplacer, faute, accroche…)
// plus que de visuel (couleur, taille, logo, image…). Kreative peut toujours changer depuis la livraison.
const MOTS_TEXTE = /(«|»|"[^"]{2,}"|\b(remplac\w*|reformul\w*|wording|copy|copywriting|accroches?|hooks?|phrases?|fautes?|orthographe|coquilles?|slogans?|promesses?|arguments?|mentions?|claims?|traduction|traduire|tutoiement|vouvoiement|texte|textes|ecrire|ecrit|formulation|tournure|mots?|prix|tarifs?)\b)/gi;
const MOTS_VISUEL = /\b(couleurs?|blanc|noir|rouge|bleu|vert|jaune|rose|taille|petit|petite|grand|grande|gros|grosse|police|typo|gras|logo|images?|photos?|visuels?|fond|contraste|position|placer|aligner|align\w*|centrer|centre|decal\w*|marges?|espaces?|zone|cadrage|recadr\w*|flou|nette?|lumi\w*|sombre|clair|produit|ombre|bordure|animation|format)\b/gi;
const sansAccents = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const parleTexte = t => { const x = sansAccents(t); return (x.match(MOTS_TEXTE) || []).length > (x.match(MOTS_VISUEL) || []).length; };
const pourQui = textes => textes.some(parleTexte) ? 'strategiste' : 'designer';
// l'état de production de chaque projet : la dernière version livrée, un déplacement manuel, la commande
async function etatsProduction(db) {
  const [{ results: L }, { results: O }, { results: K2 }] = await Promise.all([
    db.prepare(`SELECT l.dossier, l.id, l.version, l.statut, l.retouche, l.depose_le, l.verifie_le, l.envoye_le, l.review_le, l.retouche_le, l.cree_le FROM livraisons l
      WHERE l.version = (SELECT MAX(x.version) FROM livraisons x WHERE x.dossier = l.dossier)`).all(),
    db.prepare('SELECT * FROM prod_etapes').all(),
    db.prepare("SELECT dossier, statut, options FROM commandes WHERE dossier IS NOT NULL ORDER BY cree_le").all()]);
  const etats = {}, de = d => (etats[d] = etats[d] || {});
  for (const l of L) de(l.dossier).v = { id: l.id, version: l.version, statut: l.statut, retouche: ['a_corriger', 'review_terminee'].includes(l.statut) ? (l.retouche || 'designer') : null,
    le: Math.max(l.cree_le || 0, l.depose_le || 0, l.verifie_le || 0, l.envoye_le || 0, l.review_le || 0, l.retouche_le || 0) };
  for (const o of O) de(o.dossier).o = { etape: o.etape, le: o.le, par: o.par };
  // les options payées par le client (variations de texte, express ; anciennes commandes : A/B tests) : visibles par le stratégiste et la designer
  const commandes = {}, options = {};
  for (const k of K2) { commandes[k.dossier] = k.statut; if (k.options) options[k.dossier] = k.options; }
  return { etats, commandes, options, le: maintenant() };
}
// glisser un projet dans une autre colonne du Kanban : une vraie action quand il y en a une, sinon l'étape est notée
async function deplacerProjet(env, ctx, url, db, dossier, vers, qui, confirme) {
  const v = await db.prepare('SELECT * FROM livraisons WHERE dossier = ? ORDER BY version DESC LIMIT 1').bind(dossier).first();
  const k = await commandeDuDossier(db, dossier), now = maintenant();
  const noterEtape = async () => db.prepare('INSERT INTO prod_etapes (dossier, etape, le, par) VALUES (?,?,?,?) ON CONFLICT(dossier) DO UPDATE SET etape = excluded.etape, le = excluded.le, par = excluded.par')
    .bind(dossier, vers, now, qui.nom).run();
  const retouches = async pour => {
    await db.prepare("UPDATE livraisons SET statut = 'review_terminee', review_le = COALESCE(review_le, ?), retouche = ?, retouche_le = ? WHERE id = ?").bind(now, pour, now, v.id).run();
    await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(dossier).run();
    if (k && !['valide', 'annule'].includes(k.statut)) await db.prepare("UPDATE commandes SET statut = 'revisions' WHERE id = ?").bind(k.id).run();
    if (k) await noter(db, k.client_id, k.id, 'revisions', 'Retouches en cours');
  };
  const st = v && v.statut;
  // ce qui part chez le client, ou lui retire sa review, se confirme toujours (l'état a pu changer depuis l'écran)
  if (!confirme && ((vers === 'client' && st === 'a_verifier') || (['desi', 'strat'].includes(vers) && ['envoyee', 'approuvee'].includes(st))))
    return { confirmer: true, statut: st, version: v.version };
  if (vers === 'client') {
    if (st === 'a_verifier') {
      if (!await envoyerAuClient(env, ctx, url, db, v)) return { erreur: true, message: 'Cette version a déjà été envoyée.' };
      return { action: 'envoyee', message: 'Version ' + v.version + ' envoyée au client.' };
    }
    // retouches demandées par erreur : la version revient chez le client, sa review reprend
    if (st === 'review_terminee' && v.envoye_le) {
      await db.prepare("UPDATE livraisons SET statut = 'envoyee', review_le = NULL, retouche = NULL, retouche_le = ? WHERE id = ?").bind(now, v.id).run();
      await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(dossier).run();
      if (k && k.statut === 'revisions') await db.prepare("UPDATE commandes SET statut = ? WHERE id = ?").bind(await estDerniereLivraison(env, dossier) ? 'livre' : 'production', k.id).run();
      return { action: 'retour_client', message: 'La version ' + v.version + ' est de nouveau chez le client.' };
    }
    if (st === 'brouillon') return { erreur: true, message: 'La designer n\'a pas encore envoyé ses fichiers.' };
    await noterEtape();
    if (!v && k && await estDerniereLivraison(env, dossier) && !['valide', 'annule', 'livre'].includes(k.statut))
      await db.prepare("UPDATE commandes SET statut = 'livre', livre_le = COALESCE(livre_le, ?) WHERE id = ?").bind(now, k.id).run();
    return { action: 'etape', message: 'Projet passé chez le client.' };
  }
  if (vers === 'desi' || vers === 'strat') {
    const pour = vers === 'strat' ? 'strategiste' : 'designer';
    if (st === 'a_verifier') { if (!await renvoyerVersion(db, v, pour, 'Renvoyée depuis le Kanban.')) return { erreur: true, message: 'Cette version n\'est plus à vérifier.' }; return { action: 'renvoyee', message: pour === 'strategiste' ? 'Renvoyée au stratégiste.' : 'Renvoyée à la designer.' }; }
    if (st === 'envoyee' || st === 'review_terminee' || st === 'a_corriger' || st === 'approuvee') {
      if (st === 'a_corriger') { await db.prepare('UPDATE livraisons SET retouche = ?, retouche_le = ? WHERE id = ?').bind(pour, now, v.id).run(); await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(dossier).run(); }
      else await retouches(pour);
      return { action: 'retouches', message: pour === 'strategiste' ? 'Retouches confiées au stratégiste.' : 'Retouches confiées à la designer.' };
    }
    if (!v && k && k.statut === 'livre') await db.prepare("UPDATE commandes SET statut = 'revisions' WHERE id = ?").bind(k.id).run();
    await noterEtape();
    return { action: 'etape', message: vers === 'strat' ? 'Projet passé chez le stratégiste.' : 'Projet passé chez le designer.' };
  }
  // à livrer au client (vérification)
  await noterEtape();
  return { action: 'etape', message: 'Projet passé en vérification.' };
}

// ============================================================
//  L'APP DE L'ESPACE CLIENT : installée sur l'écran d'accueil (PWA),
//  avec des notifications (Web Push, sans contenu chiffré : le téléphone
//  est réveillé, puis l'app lit la dernière notification du client).
//  Les clés VAPID sont créées toutes seules et gardées dans la base.
// ============================================================
const MANIFESTE = { name: 'Kreative', short_name: 'Kreative', description: 'Votre espace client Kreative', id: '/client/', start_url: '/client/?app=1', scope: '/client/',
  display: 'standalone', background_color: '#f8f6f3', theme_color: '#ffffff', lang: 'fr',
  icons: [{ src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/app-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
// ses icônes à lui (Dario) : Windows = fond blanc arrondi, téléphone = K blanc sur fond noir ; l'app des clients ne change pas
const MANIFESTE_ADMIN = { ...MANIFESTE, name: 'Kreative Admin', short_name: 'Kreative', description: 'L\'admin Kreative', id: '/admin/', start_url: '/admin/', scope: '/admin/',
  icons: [{ src: '/app-icon-admin-bureau-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/app-icon-admin-bureau-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/app-icon-admin-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
// l'app admin : juste de quoi s'installer (pas de cache, pas de notifications)
const SERVICE_WORKER_ADMIN = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});`;
const SERVICE_WORKER = `self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
self.addEventListener('push', e => e.waitUntil(fetch('/api/client/notifications/derniere', { credentials: 'include' }).then(r => r.json()).catch(() => ({}))
  .then(n => self.registration.showNotification(n.titre || 'Kreative', { body: n.texte || 'Du nouveau dans votre espace.', icon: '/app-icon-192.png', badge: '/favicon-48.png', data: { url: n.url || '/client/' } }))));
self.addEventListener('notificationclick', e => { e.notification.close(); const u = (e.notification.data && e.notification.data.url) || '/client/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { const w = l.find(x => x.url.includes('/client/')); return w ? w.navigate(u).then(x => (x || w).focus()) : self.clients.openWindow(u); })); });`;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let VAPID = null;
async function clesVapid(env) {
  if (VAPID) return VAPID;
  const db = await baseLiv(env);
  let r = await db.prepare("SELECT valeur FROM reglages WHERE cle = 'vapid'").first();
  if (!r) {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', k.privateKey), pub = b64u(await crypto.subtle.exportKey('raw', k.publicKey));
    await db.prepare("INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub })).run();
    r = await db.prepare("SELECT valeur FROM reglages WHERE cle = 'vapid'").first();
  }
  const v = JSON.parse(r.valeur);
  VAPID = { publique: v.pub, privee: await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return VAPID;
}
async function jetonVapid(env, endpoint) {
  const v = await clesVapid(env), enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const corps = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:contact@kreativeads.fr' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.privee, new TextEncoder().encode(corps));
  return { jwt: corps + '.' + b64u(sig), cle: v.publique };
}
// une notification au client : gardée (l'app la lit), puis chaque appareil abonné est réveillé
async function notifier(env, clientId, n) {
  try {
    const db = await baseLiv(env);
    await db.prepare('INSERT INTO notifications (client_id, titre, texte, url, cree_le) VALUES (?,?,?,?,?)').bind(clientId, String(n.titre || 'Kreative').slice(0, 120), String(n.texte || '').slice(0, 300), String(n.url || '/client/').slice(0, 300), maintenant()).run();
    const { results } = await db.prepare('SELECT endpoint FROM push_abos WHERE client_id = ?').bind(clientId).all();
    let envoyes = 0;
    for (const a of results) {
      try {
        const { jwt, cle } = await jetonVapid(env, a.endpoint);
        const r = await fetch(a.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + jwt + ', k=' + cle, 'Content-Length': '0' } });
        if (r.status === 404 || r.status === 410) await db.prepare('DELETE FROM push_abos WHERE endpoint = ?').bind(a.endpoint).run();
        else if (r.ok) envoyes++;
      } catch (e) {}
    }
    return envoyes;
  } catch (e) { return 0; }
}

// le logo Kreative (logo + texte) dessiné dans la page : rien à charger, il s'affiche tout de suite (les emails gardent le PNG léger)
const LOGO_SVG = '<svg class="k-marque" viewBox="0 0 125.3 24.7" role="img" aria-label="Kreative" fill="currentColor"><path fill-rule="evenodd" d="M10.1 24.36C9.76 24.17 9.32 23.93 9.12 23.82C8.93 23.71 8.51 23.47 8.19 23.28C7.86 23.1 7.3 22.78 6.94 22.58C6.58 22.37 6.28 22.2 6.27 22.2C6.26 22.2 6.12 22.12 5.97 22.03C5.7 21.87 4.79 21.36 4.25 21.06C4.13 20.99 3.96 20.9 3.88 20.85C3.79 20.8 3.61 20.7 3.48 20.62C3.03 20.37 1.63 19.59 1.28 19.39C1.08 19.28 0.84 19.14 0.73 19.08C0.4 18.9 0.1 18.51 0.1 18.25C0.1 18.2 0.08 18.14 0.05 18.12C-0.01 18.09 -0.02 6.47 0.04 6.43C0.07 6.41 0.1 6.34 0.12 6.26C0.15 6.06 0.47 5.75 0.8 5.56C0.95 5.48 1.23 5.32 1.43 5.21C1.62 5.1 2.14 4.81 2.58 4.57C3.02 4.32 3.45 4.07 3.55 4.02C3.65 3.96 4.19 3.66 4.75 3.35C5.31 3.04 5.9 2.72 6.05 2.63C6.2 2.54 6.71 2.26 7.18 2C7.64 1.75 8.11 1.48 8.21 1.42C8.31 1.35 8.41 1.3 8.42 1.3C8.44 1.3 8.98 1 9.5 0.71C10.85 -0.05 10.73 0 11.15 0C11.56 -0 11.69 0.06 13.18 0.96C13.31 1.05 13.5 1.15 13.58 1.2C14.32 1.62 14.36 1.73 14 2.3C13.93 2.42 13.56 3.03 13.2 3.65C12.84 4.27 12.48 4.88 12.4 5C12.32 5.12 11.96 5.73 11.6 6.35C11.23 6.97 10.84 7.64 10.72 7.84C10.6 8.04 10.5 8.21 10.5 8.22C10.5 8.23 10.38 8.44 10.23 8.68C10.09 8.93 9.77 9.46 9.53 9.88C9.28 10.29 8.98 10.8 8.85 11.03C8.29 11.97 8.15 12.23 8.15 12.3C8.15 12.35 8.24 12.53 8.34 12.7C8.45 12.88 8.77 13.42 9.05 13.9C9.33 14.38 9.69 14.99 9.85 15.25C10.01 15.51 10.43 16.23 10.8 16.85C11.16 17.47 11.55 18.11 11.65 18.28C11.75 18.44 12.03 18.89 12.25 19.28C12.48 19.66 13 20.54 13.42 21.22C13.83 21.91 14.19 22.55 14.23 22.63C14.32 22.84 14.25 23.01 14.03 23.14C13.94 23.19 13.59 23.4 13.25 23.6C12.91 23.8 12.41 24.09 12.15 24.25C11.15 24.85 11.01 24.86 10.1 24.36ZM55.59 21.58C55.58 21.56 55.41 21.52 55.22 21.5C53.15 21.23 51.21 19.94 50.3 18.24C49.6 16.92 49.38 15.04 49.75 13.58C49.77 13.47 49.81 13.31 49.83 13.23C49.84 13.14 49.88 13.03 49.9 12.98C49.92 12.92 49.99 12.74 50.05 12.58C50.83 10.52 52.93 8.9 55.15 8.63C56.26 8.49 57.43 8.52 58.24 8.7C58.8 8.83 58.94 8.87 59.23 8.96C59.89 9.18 60.93 9.78 61.38 10.21C61.49 10.31 61.59 10.4 61.6 10.4C61.68 10.4 62.7 11.72 62.7 11.82C62.7 11.83 62.76 11.95 62.84 12.09C63.23 12.74 63.47 13.59 63.56 14.63C63.59 14.98 63.59 15.4 63.57 15.65L63.53 16.07L58.53 16.09C55.06 16.1 53.52 16.12 53.5 16.15C53.45 16.24 53.57 16.7 53.75 17.07C54.03 17.66 54.71 18.28 55.25 18.44C55.38 18.48 55.52 18.53 55.58 18.55C55.95 18.7 57.63 18.7 57.73 18.54C57.74 18.52 57.8 18.5 57.85 18.5C58.13 18.5 58.76 18.15 59.15 17.77L59.43 17.5L61.3 17.5C62.33 17.5 63.21 17.5 63.24 17.5C63.35 17.5 63.28 17.72 62.98 18.35C62.65 19.05 61.82 20 61.12 20.46C60.18 21.08 59.45 21.36 58.4 21.51C57.98 21.56 55.64 21.62 55.59 21.58ZM70.23 21.55C70.17 21.53 70.05 21.51 69.96 21.5C69.86 21.5 69.69 21.48 69.58 21.45C69.47 21.42 69.29 21.37 69.17 21.34C67.71 20.96 66.33 19.99 65.49 18.75C64.92 17.91 64.7 17.34 64.49 16.15C64.41 15.73 64.41 14.49 64.49 13.98C64.53 13.76 64.57 13.49 64.58 13.39C64.6 13.28 64.63 13.19 64.66 13.17C64.68 13.16 64.7 13.1 64.7 13.05C64.7 12.99 64.72 12.91 64.75 12.86C64.77 12.81 64.85 12.62 64.93 12.43C65.46 11.1 66.53 9.95 67.81 9.33C68.02 9.23 68.21 9.15 68.22 9.15C68.24 9.15 68.35 9.11 68.46 9.06C68.69 8.95 69.21 8.8 69.67 8.69C70.08 8.6 72.11 8.6 72.5 8.69C73.75 8.98 74.63 9.42 75.22 10.05C75.3 10.13 75.39 10.2 75.41 10.2C75.43 10.2 75.45 9.9 75.45 9.53C75.45 9.04 75.47 8.86 75.51 8.84C75.55 8.83 76.33 8.83 77.26 8.84L78.95 8.85L78.95 15.1L78.95 21.35L77.21 21.34L75.48 21.33L75.46 20.69C75.45 20.31 75.43 20.05 75.4 20.05C75.37 20.05 75.21 20.18 75.04 20.35C74.34 21.01 73.7 21.33 72.7 21.51C72.34 21.57 70.35 21.61 70.23 21.55ZM117 21.55C116.93 21.53 116.79 21.51 116.68 21.5C116.57 21.5 116.39 21.48 116.28 21.45C116.17 21.42 115.98 21.37 115.88 21.34C113.58 20.74 111.72 18.88 111.31 16.74C111.28 16.58 111.23 16.33 111.2 16.19C111.13 15.87 111.16 14.08 111.24 13.75C111.27 13.63 111.31 13.46 111.33 13.38C111.34 13.29 111.38 13.18 111.4 13.12C111.42 13.07 111.49 12.9 111.55 12.74C111.9 11.76 112.62 10.72 113.4 10.1C113.55 9.98 113.7 9.85 113.74 9.81C113.78 9.78 113.83 9.75 113.85 9.75C113.87 9.75 113.93 9.72 113.97 9.67C114.12 9.52 115.3 8.95 115.46 8.95C115.51 8.95 115.56 8.93 115.57 8.91C115.59 8.88 115.66 8.85 115.74 8.84C115.81 8.82 116.01 8.78 116.18 8.73C117.02 8.52 118.12 8.46 119.06 8.57C119.92 8.68 120.47 8.8 121.03 9C122.67 9.59 124.25 11.12 124.8 12.65C124.83 12.75 124.88 12.87 124.9 12.93C125 13.19 125.11 13.69 125.22 14.44C125.31 15.04 125.32 15.25 125.25 15.61C125.22 15.76 125.18 15.93 125.17 15.99C125.15 16.1 125.15 16.1 120.08 16.1C115.67 16.1 115.01 16.11 114.98 16.17C114.95 16.27 115.2 16.97 115.37 17.27C115.64 17.73 116.41 18.4 116.67 18.4C116.71 18.4 116.76 18.42 116.78 18.45C116.79 18.48 116.86 18.5 116.93 18.5C116.99 18.5 117.06 18.52 117.07 18.54C117.1 18.59 117.34 18.62 118 18.68C118.43 18.72 119.28 18.61 119.68 18.45C119.73 18.43 119.85 18.38 119.95 18.35C120.22 18.25 120.55 18.01 120.8 17.74L121.03 17.5L122.97 17.5C124.04 17.49 124.92 17.5 124.93 17.52C124.98 17.56 124.46 18.59 124.22 18.96C123.27 20.37 121.75 21.25 119.76 21.55C119.35 21.61 117.19 21.61 117 21.55ZM87.12 21.45C87.07 21.43 86.92 21.41 86.79 21.4C86.37 21.4 85.55 21.15 85.06 20.89C84.9 20.81 84.71 20.7 84.63 20.66C84.21 20.44 83.51 19.63 83.26 19.07C83.22 18.99 83.17 18.89 83.14 18.84C83.12 18.79 83.1 18.71 83.1 18.65C83.1 18.6 83.08 18.54 83.06 18.53C83.03 18.51 83 18.43 82.98 18.34C82.96 18.25 82.92 18.05 82.89 17.9C82.86 17.73 82.82 16.49 82.81 14.78L82.78 11.93L81.69 11.91L80.6 11.9L80.6 11.17C80.6 10.73 80.62 10.4 80.66 10.33C80.69 10.27 81 9.93 81.34 9.57C81.69 9.22 82.49 8.37 83.12 7.7C85.73 4.93 85.48 5.14 86.14 5.16L86.58 5.18L86.6 7L86.62 8.83L88.4 8.84C89.38 8.84 90.2 8.85 90.24 8.85C90.29 8.85 90.3 9.19 90.3 10.38C90.3 11.56 90.29 11.9 90.24 11.9C90.2 11.9 89.38 11.91 88.4 11.91L86.62 11.93L86.63 14.25C86.63 15.53 86.64 16.67 86.67 16.78C86.84 17.66 87.2 18.09 88.01 18.35C88.14 18.39 88.54 18.4 89.24 18.4L90.28 18.38L90.29 19.89C90.3 21.28 90.3 21.39 90.21 21.43C90.08 21.48 87.24 21.51 87.12 21.45ZM37.89 21.36L35.71 21.35L35.29 20.79C35.06 20.48 34.84 20.18 34.8 20.12C34.76 20.06 34.56 19.79 34.35 19.52C34.14 19.26 33.94 18.99 33.9 18.93C33.86 18.87 33.68 18.63 33.5 18.4C32.92 17.63 32.55 17.13 32.41 16.91C32.34 16.8 32.25 16.69 32.22 16.68C32.19 16.67 32.01 16.84 31.82 17.06C31.63 17.28 31.4 17.55 31.31 17.65C31.15 17.84 31.15 17.84 31.14 19.58L31.12 21.33L29.16 21.34L27.2 21.35L27.21 12.34L27.23 3.33L29.18 3.33L31.12 3.33L31.15 8.53C31.16 11.39 31.19 13.73 31.21 13.73C31.24 13.73 31.62 13.3 31.78 13.09C31.95 12.86 32.66 11.98 32.87 11.74C33.08 11.51 33.28 11.26 33.91 10.47C35.15 8.92 35.19 8.88 35.45 8.84C35.81 8.79 39.55 8.8 39.58 8.86C39.6 8.89 39.52 9 39.41 9.12C39.31 9.23 39.12 9.45 39 9.6C38.87 9.75 38.7 9.95 38.62 10.05C38.53 10.15 38.3 10.42 38.1 10.65C37.9 10.88 37.61 11.22 37.46 11.4C37.3 11.57 37.13 11.78 37.08 11.85C36.95 12.01 36.53 12.5 36.12 12.95C35.61 13.52 34.98 14.26 34.96 14.3C34.95 14.34 35.27 14.83 35.35 14.9C35.37 14.91 35.43 15 35.5 15.1C35.57 15.2 35.76 15.45 35.92 15.66C36.09 15.87 36.3 16.14 36.39 16.26C36.48 16.38 36.68 16.63 36.83 16.82C36.98 17.02 37.15 17.25 37.22 17.35C37.32 17.5 37.67 17.95 38.14 18.55C38.21 18.64 38.53 19.06 38.85 19.48C39.17 19.89 39.6 20.46 39.82 20.74C40.16 21.19 40.27 21.44 40.11 21.39C40.09 21.38 39.09 21.37 37.89 21.36ZM104.06 21.35C102.37 21.33 102.08 21.31 102.05 21.25C102.03 21.21 101.89 20.87 101.75 20.5C101.6 20.13 101.47 19.8 101.45 19.78C101.43 19.75 101.36 19.59 101.3 19.43C101.24 19.26 101.16 19.05 101.12 18.95C101.07 18.85 101.02 18.73 101 18.68C100.98 18.62 100.93 18.5 100.88 18.4C100.64 17.85 100.2 16.73 100.2 16.67C100.2 16.63 100.18 16.6 100.15 16.6C100.12 16.6 100.1 16.57 100.1 16.52C100.1 16.48 100.08 16.41 100.06 16.36C100.03 16.31 99.99 16.22 99.96 16.15C99.93 16.08 99.88 15.95 99.83 15.85C99.79 15.75 99.68 15.47 99.57 15.23C99.47 14.98 99.35 14.68 99.3 14.57C99.24 14.46 99.1 14.11 98.97 13.79C98.84 13.48 98.71 13.15 98.66 13.05C98.57 12.82 98.53 12.73 98.4 12.38C98.34 12.21 98.27 12.05 98.24 12.03C98.22 12 98.2 11.95 98.2 11.91C98.2 11.88 98.16 11.75 98.1 11.64C98.05 11.52 97.89 11.13 97.75 10.78C97.51 10.17 97.39 9.9 97.23 9.53C97.14 9.35 97 8.94 97 8.89C97 8.87 97.95 8.85 99.11 8.86L101.21 8.88L101.36 9.28C101.44 9.5 101.53 9.71 101.55 9.76C101.58 9.81 101.6 9.88 101.6 9.93C101.6 9.97 101.62 10.05 101.65 10.1C101.68 10.16 101.72 10.24 101.75 10.3C101.78 10.35 101.8 10.44 101.8 10.5C101.8 10.55 101.82 10.61 101.85 10.62C101.88 10.64 101.9 10.71 101.9 10.78C101.9 10.84 101.92 10.91 101.94 10.92C101.96 10.93 102.01 11.06 102.05 11.2C102.09 11.34 102.14 11.47 102.16 11.48C102.18 11.49 102.2 11.56 102.2 11.62C102.2 11.68 102.22 11.75 102.23 11.77C102.27 11.8 102.29 11.84 102.52 12.5C102.6 12.71 102.67 12.92 102.7 12.98C102.72 13.03 102.77 13.15 102.8 13.25C102.83 13.35 102.88 13.47 102.9 13.53C102.92 13.58 103 13.79 103.08 14C103.15 14.21 103.23 14.44 103.26 14.53C103.29 14.61 103.33 14.7 103.36 14.72C103.38 14.75 103.4 14.82 103.4 14.88C103.4 14.94 103.42 15.01 103.45 15.03C103.48 15.04 103.5 15.11 103.5 15.18C103.5 15.24 103.52 15.31 103.54 15.32C103.56 15.33 103.61 15.46 103.65 15.6C103.69 15.74 103.74 15.87 103.76 15.88C103.78 15.89 103.8 15.96 103.8 16.03C103.8 16.09 103.82 16.16 103.85 16.18C103.88 16.19 103.9 16.26 103.9 16.32C103.9 16.38 103.91 16.45 103.93 16.47C103.95 16.48 104.03 16.68 104.1 16.9C104.33 17.56 104.25 17.67 104.95 15.68C105.03 15.43 105.13 15.19 105.15 15.14C105.18 15.09 105.2 15.02 105.2 14.98C105.2 14.93 105.22 14.86 105.25 14.81C105.28 14.76 105.38 14.49 105.47 14.2C105.57 13.91 105.72 13.45 105.82 13.18C105.92 12.9 106.06 12.51 106.13 12.3C106.2 12.09 106.27 11.88 106.3 11.83C106.36 11.69 106.57 11.1 106.7 10.7C106.76 10.52 106.83 10.34 106.85 10.29C106.88 10.24 106.9 10.16 106.9 10.1C106.9 10.05 106.92 9.99 106.95 9.98C106.98 9.96 107 9.89 107 9.83C107 9.77 107.02 9.7 107.03 9.68C107.05 9.66 107.13 9.48 107.2 9.26L107.33 8.88L108.1 8.85C109.33 8.81 111.4 8.85 111.4 8.91C111.4 8.94 111.36 9.04 111.32 9.14C111.28 9.24 111.22 9.37 111.2 9.43C111.18 9.48 111.1 9.65 111.03 9.81C110.96 9.97 110.9 10.11 110.9 10.13C110.9 10.14 110.83 10.29 110.75 10.48C110.67 10.66 110.6 10.82 110.6 10.85C110.6 10.88 110.58 10.94 110.56 10.99C110.53 11.04 110.49 11.13 110.46 11.2C110.38 11.42 110.29 11.62 110.24 11.71C110.22 11.76 110.2 11.82 110.2 11.85C110.2 11.88 110.16 12 110.11 12.11C110.05 12.23 109.96 12.45 109.9 12.6C109.84 12.75 109.76 12.95 109.71 13.05C109.67 13.15 109.62 13.27 109.6 13.33C109.56 13.43 109.48 13.62 109.3 14.03C109.24 14.16 109.18 14.32 109.15 14.38C109.13 14.43 109.06 14.58 109 14.71C108.95 14.84 108.9 14.98 108.9 15.01C108.9 15.05 108.88 15.1 108.86 15.13C108.83 15.15 108.74 15.37 108.65 15.6C108.45 16.13 108.43 16.17 108.3 16.47C108.24 16.6 108.15 16.83 108.09 16.97C108.04 17.11 107.94 17.34 107.87 17.49C107.8 17.63 107.75 17.78 107.75 17.82C107.75 17.85 107.73 17.9 107.71 17.93C107.69 17.95 107.62 18.1 107.55 18.25C107.49 18.4 107.41 18.6 107.36 18.7C107.26 18.95 107.19 19.11 107.15 19.23C107.11 19.33 107.04 19.5 106.96 19.71C106.93 19.79 106.87 19.91 106.84 19.99C106.81 20.06 106.77 20.17 106.75 20.23C106.73 20.28 106.69 20.38 106.66 20.45C106.43 20.97 106.35 21.17 106.35 21.23C106.35 21.31 106.19 21.41 106.09 21.39C106.05 21.38 105.14 21.37 104.06 21.35ZM40.8 15.11C40.8 9.93 40.81 8.86 40.87 8.83C40.9 8.82 41.71 8.81 42.65 8.82L44.38 8.83L44.4 9.7C44.42 10.43 44.44 10.58 44.5 10.58C44.54 10.58 44.6 10.52 44.63 10.46C44.73 10.25 45.51 9.5 45.85 9.28C46.27 9.01 46.55 8.88 47.1 8.71C47.48 8.59 48.34 8.52 49.04 8.54L49.3 8.55L49.3 10.4L49.3 12.26L49.04 12.23C47.06 12.03 45.84 12.46 45.15 13.59C44.78 14.23 44.78 14.13 44.75 17.93L44.73 21.33L42.76 21.34L40.8 21.35L40.8 15.11ZM92.1 15.13C92.1 10.22 92.11 8.9 92.16 8.86C92.25 8.79 95.73 8.81 95.8 8.88C95.83 8.91 95.85 10.84 95.84 15.13L95.83 21.33L93.96 21.34L92.1 21.35L92.1 15.13ZM16.69 21.21C16.65 21.16 16.56 21.04 16.5 20.93C16.44 20.82 16.27 20.53 16.13 20.3C16 20.07 15.73 19.62 15.55 19.3C15.37 18.98 15.03 18.41 14.8 18.03C14.34 17.25 14.09 16.82 13.56 15.93C13.37 15.59 13.03 15.01 12.8 14.62C12.57 14.24 12.3 13.78 12.2 13.6C12.1 13.42 11.9 13.08 11.76 12.83C11.5 12.4 11.43 12.09 11.55 11.97C11.57 11.95 11.71 11.72 11.85 11.48C12.4 10.53 12.69 10.03 13.2 9.18C13.43 8.79 13.69 8.35 13.77 8.2C13.86 8.05 14.06 7.71 14.22 7.45C14.37 7.2 14.5 6.98 14.5 6.97C14.5 6.96 14.66 6.67 14.87 6.34C15.21 5.76 15.87 4.64 16.31 3.88C16.82 3 16.76 3.01 18.03 3.76C18.16 3.85 18.35 3.96 18.45 4.01C18.55 4.07 18.65 4.13 18.68 4.15C18.7 4.17 18.93 4.31 19.18 4.45C19.42 4.6 19.69 4.75 19.78 4.8C20.46 5.2 21.28 5.72 21.34 5.79C21.46 5.95 21.6 6.31 21.6 6.48C21.6 6.63 21.31 7.26 21.15 7.48C21.13 7.5 20.99 7.73 20.85 7.98C20.7 8.22 20.55 8.49 20.5 8.58C20.45 8.66 20.3 8.92 20.16 9.15C20.03 9.38 19.73 9.89 19.5 10.28C19.27 10.66 19 11.12 18.9 11.3C18.8 11.48 18.65 11.74 18.56 11.89C18.35 12.24 18.36 12.34 18.62 12.8C18.74 13 18.89 13.28 18.96 13.4C19.03 13.52 19.3 13.98 19.55 14.43C19.8 14.87 20.08 15.35 20.16 15.5C20.25 15.65 20.35 15.83 20.4 15.9C20.47 16.01 20.84 16.65 21.33 17.54C21.74 18.27 21.58 18.64 20.56 19.24C20.24 19.43 19.81 19.69 19.6 19.81C18.78 20.3 17.97 20.78 17.93 20.79C17.91 20.8 17.71 20.92 17.49 21.06C17.06 21.32 16.82 21.37 16.69 21.21ZM72.35 18.4C72.73 18.35 72.94 18.31 73.08 18.25C74.12 17.84 74.76 17.17 75.07 16.15C75.26 15.55 75.21 14.3 74.98 13.79C74.94 13.7 74.88 13.55 74.84 13.46C74.81 13.37 74.76 13.3 74.74 13.3C74.72 13.3 74.7 13.27 74.7 13.23C74.7 13.04 73.81 12.19 73.41 12C73.28 11.94 73.14 11.87 73.09 11.84C73.04 11.82 72.96 11.8 72.9 11.8C72.85 11.8 72.79 11.78 72.78 11.76C72.74 11.69 72.42 11.65 71.83 11.62C70.11 11.53 68.72 12.56 68.3 14.23C68.13 14.9 68.16 15.4 68.43 16.3C68.48 16.46 68.68 16.83 68.84 17.05C69 17.26 69.65 17.9 69.72 17.9C69.74 17.9 69.82 17.94 69.89 17.99C70.39 18.34 71.48 18.52 72.35 18.4ZM59.81 13.66C59.9 13.57 59.4 12.71 59.06 12.39C58.39 11.76 57.75 11.53 56.65 11.53C56.03 11.53 55.86 11.55 55.48 11.66C54.91 11.81 54.33 12.19 54.08 12.57C53.75 13.08 53.5 13.64 53.59 13.69C53.66 13.74 59.76 13.71 59.81 13.66ZM121.42 13.69C121.47 13.64 121.17 13.02 120.95 12.73C120.61 12.27 119.82 11.7 119.51 11.7C119.46 11.7 119.4 11.68 119.37 11.65C119.21 11.5 117.22 11.5 117.12 11.66C117.11 11.68 117.05 11.7 117.01 11.7C116.76 11.7 116 12.19 115.69 12.55C115.43 12.85 115.05 13.64 115.14 13.7C115.21 13.73 121.39 13.73 121.42 13.69ZM93.33 7.29C92.57 7.03 92.11 6.64 91.8 5.98C91.62 5.6 91.62 4.71 91.8 4.28C92.17 3.35 92.9 2.86 94 2.81C96.64 2.7 97.32 6.36 94.82 7.24C94.49 7.36 93.61 7.39 93.33 7.29Z"/></svg>';

// ---------- les emails (le HTML est fait ici ; n8n l'envoie tel quel) ----------
function emailHtml(origine, o) {
  const e = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<div style="background:#f3f1ec;padding:32px 12px;font-family:Inter,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ebe5df;border-radius:18px;padding:36px 40px">' +
    '<img src="' + e(origine) + '/ui/logo-kreative-noir.png" alt="Kreative" height="26" style="display:block;height:26px">' +
    '<h1 style="font-size:24px;line-height:1.25;margin:28px 0 14px;color:#000">' + e(o.titre) + '</h1>' +
    o.paragraphes.map(p => '<p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 14px">' + p + '</p>').join('') +
    (o.bouton ? '<a href="' + e(o.bouton[1]) + '" style="display:inline-block;margin-top:10px;background:#4d94ff;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 26px;border-radius:12px">' + e(o.bouton[0]) + '</a>' : '') +
    (o.note ? '<p style="font-size:13.5px;line-height:1.6;color:#777;margin:26px 0 0">' + o.note + '</p>' : '') +
    '<p style="font-size:13.5px;line-height:1.6;color:#777;margin:14px 0 0">Une question ? Répondez simplement à cet email ou écrivez-nous sur <a href="https://api.whatsapp.com/send?phone=33756921042" style="color:#4d94ff">WhatsApp</a>.</p>' +
    '</div></div>';
}
const echapper = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function emailAcces(url, cl, lien) {
  const prenom = String(cl.contact || '').trim().split(/\s+/)[0];
  return { type: 'acces', a: cl.email, marque: cl.marque, contact: cl.contact || '', lien,
    sujet: cl.marque + ' · votre espace client Kreative',
    html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
      paragraphes: ['Voici votre lien personnel vers l\'espace client de <b>' + echapper(cl.marque) + '</b>. Vous y suivez l\'avancement de vos projets, votre brief et vos prochaines commandes.'],
      bouton: ['Ouvrir mon espace', lien], note: 'Ce lien est personnel et reste valable : gardez cet email pour revenir quand vous voulez. Ne le transférez pas.' }) };
}

// ---------- API de l'équipe (designer et admin) ----------
async function apiEquipe(req, env, ctx, url, chemin, methode, qui) {
  const db = await baseLiv(env);
  const admin = qui.role === 'admin';
  let m;
  // Wimmov n'existe pas pour le stratégiste et la designer : ses livraisons (WIMMOV_…) leur sont cachées
  const cache = d => !admin && DOSSIER_WIMMOV.test(String(d || ''));
  if (!admin) {
    const viseLiv = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)(\/|$)/), viseFic = chemin.match(/^\/fichiers\/(fi_[A-Za-z0-9_]+)(\/|$)/);
    const idLiv = viseLiv ? viseLiv[1] : chemin === '/fichiers' ? url.searchParams.get('livraison') : null;
    let d = null;
    if (idLiv) d = (await db.prepare('SELECT dossier FROM livraisons WHERE id = ?').bind(idLiv).first() || {}).dossier;
    else if (viseFic) d = (await db.prepare('SELECT l.dossier FROM fichiers f JOIN livraisons l ON l.id = f.livraison_id WHERE f.id = ?').bind(viseFic[1]).first() || {}).dossier;
    else if (chemin === '/commentaires' && methode === 'POST') {
      const b0 = await req.clone().json().catch(() => ({}));
      d = (await db.prepare('SELECT l.dossier FROM fichiers f JOIN livraisons l ON l.id = f.livraison_id WHERE f.id = ?').bind(propre(b0.fichier_id, 40)).first() || {}).dossier;
    } else if (chemin === '/livraisons' && methode === 'POST') d = (await req.clone().json().catch(() => ({}))).dossier;
    else if ((m = chemin.match(/^\/livraisons\/([A-Za-z0-9_-]{3,80})$/))) d = m[1];
    if (cache(d)) return json({ erreur: 'Introuvable' }, 404);
  }
  // la fiche créas envoyée depuis le portail : la session suffit, le code Kreative est ajouté ici
  // (secret CODE_FICHE dans Cloudflare), le stratégiste n'a plus rien à taper
  if (chemin === '/fiche' && methode === 'POST') {
    if (!['admin', 'strategiste'].includes(qui.role)) return json({ erreur: 'Accès refusé' }, 403);
    let charge;
    try { charge = await req.json(); } catch (e) { return json({ erreur: 'Fiche illisible.' }, 400); }
    if (!charge || typeof charge !== 'object' || !/^[A-Za-z0-9_-]{3,80}$/.test(String(charge.dossier || ''))) return json({ erreur: 'Projet inconnu.' }, 400);
    if (!env.CODE_FICHE) return json({ erreur: 'Le code de la fiche n\'est pas réglé dans Cloudflare (secret CODE_FICHE).', code_manquant: true }, 503);
    // v71 : le code tel que collé dans Cloudflare, même copié avec ses guillemets, sa virgule ou le commentaire de la ligne n8n
    const brut = String(env.CODE_FICHE), entre = brut.match(/['"`]([^'"`]+)['"`]/);
    charge.code = (entre ? entre[1] : brut.replace(/\/\/.*$/, '')).trim().replace(/^[\s,;]+|[\s,;]+$/g, '');
    let r;
    try { r = await fetch(env.N8N_FICHE || N8N_FICHE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(charge) }); }
    catch (e) { return json({ erreur: 'n8n ne répond pas.' }, 502); }
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
  }
  // toutes les livraisons (la liste de l'admin, l'historique de la designer)
  if (chemin === '/livraisons' && methode === 'GET') {
    const { results } = await db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id) AS nb,
      (SELECT COUNT(*) FROM commentaires c WHERE c.livraison_id = l.id AND c.interne = 0) AS nb_client,
      (SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id AND f.approuve_le IS NOT NULL) AS nb_approuves
      FROM livraisons l ORDER BY COALESCE(l.depose_le, l.cree_le) DESC LIMIT 300`).all();
    if (!admin) for (let n = results.length - 1; n >= 0; n--) if (cache(results[n].dossier)) results.splice(n, 1);
    const { results: K2 } = await db.prepare("SELECT k.dossier, k.ref, k.id AS commande_id, c.marque FROM commandes k JOIN clients c ON c.id = k.client_id WHERE k.dossier IS NOT NULL").all();
    return json(results.map(l => { const k = K2.find(x => x.dossier === l.dossier || x.dossier === baseDossier(l.dossier)) || {}; return { ...l, marque: k.marque || null, ref: k.ref || null }; }));
  }
  // un projet : toutes ses versions, avec fichiers et commentaires
  if ((m = chemin.match(/^\/livraisons\/([A-Za-z0-9_-]{3,80})$/)) && methode === 'GET') {
    const { results } = await db.prepare('SELECT * FROM livraisons WHERE dossier = ? ORDER BY version DESC').bind(m[1]).all();
    return json({ dossier: m[1], versions: await Promise.all(results.map(l => detailLivraison(db, l, false))), stockage: !!env.FICHIERS });
  }
  // la version en cours de dépôt (créée au besoin, à partir de la précédente)
  if (chemin === '/livraisons' && methode === 'POST') {
    const b = await corpsJson(req);
    const dossier = propre(b.dossier, 80);
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(dossier)) return json({ erreur: 'Projet invalide.' }, 400);
    const der = await db.prepare('SELECT * FROM livraisons WHERE dossier = ? ORDER BY version DESC LIMIT 1').bind(dossier).first();
    if (der && der.statut === 'brouillon') return json(await detailLivraison(db, der, false));
    if (der && ['a_corriger', 'review_terminee'].includes(der.statut) && der.retouche === 'strategiste')
      return json({ erreur: 'The strategist is updating the copy first. You can upload the new version as soon as it is done.' }, 409);
    if (der && ['a_verifier', 'envoyee', 'approuvee'].includes(der.statut))
      return json({ erreur: der.statut === 'a_verifier' ? 'Kreative is checking your last delivery.' : der.statut === 'envoyee' ? 'The client is reviewing this delivery.' : 'This delivery is approved.' }, 409);
    const id = 'l_' + aleatoire(10), now = maintenant();
    try { await db.prepare('INSERT INTO livraisons (id, dossier, version, statut, cree_le) VALUES (?,?,?,?,?)').bind(id, dossier, der ? der.version + 1 : 1, 'brouillon', now).run(); }
    catch (e) {
      // deux dépôts en même temps : le second reprend le brouillon créé par le premier
      const deja = await db.prepare("SELECT * FROM livraisons WHERE dossier = ? AND statut = 'brouillon' ORDER BY version DESC LIMIT 1").bind(dossier).first();
      if (deja) return json(await detailLivraison(db, deja, false));
      return json({ erreur: 'Please try again.' }, 409);
    }
    if (der) {
      // la nouvelle version reprend les fichiers de la précédente : on ne remplace que ce qui change
      const { results: F } = await db.prepare('SELECT * FROM fichiers WHERE livraison_id = ?').bind(der.id).all();
      if (F.length) await db.batch(F.map(f => db.prepare('INSERT INTO fichiers (id, livraison_id, format, nom, cle, mini, type, taille, largeur, hauteur, approuve_le, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind('fi_' + aleatoire(12), id, f.format, f.nom, f.cle, f.mini, f.type, f.taille, f.largeur, f.hauteur, f.approuve_le, now)));
    }
    return json(await detailLivraison(db, await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(id).first(), false));
  }
  // déposer un fichier (le corps de la requête est le fichier)
  if (chemin === '/fichiers' && methode === 'PUT') {
    if (!env.FICHIERS) return json({ erreur: 'File storage is not connected yet (R2 binding FICHIERS).' }, 503);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(url.searchParams.get('livraison') || '').first();
    if (!l || l.statut !== 'brouillon') return json({ erreur: 'This delivery can no longer be changed.' }, 409);
    const format = FORMATS_OK.includes(url.searchParams.get('format')) ? url.searchParams.get('format') : 'autre';
    const nom = propre(url.searchParams.get('nom'), 120).replace(/[^A-Za-z0-9._ -]/g, '_') || 'fichier';
    const type = (req.headers.get('Content-Type') || '').split(';')[0];
    if (type !== 'image/png') return json({ erreur: 'PNG files only.' }, 415);
    const taille = Number(req.headers.get('Content-Length') || 0);
    if (taille > 95e6) return json({ erreur: 'File too large (95 MB max).' }, 413);
    const id = 'fi_' + aleatoire(12), cle = 'livraisons/' + l.dossier + '/' + l.id + '/' + id + '-' + nom.replace(/\s+/g, '_');
    await env.FICHIERS.put(cle, req.body, { httpMetadata: { contentType: type } });
    // même nom dans le même format : le nouveau remplace l'ancien
    await db.prepare('DELETE FROM fichiers WHERE livraison_id = ? AND format = ? AND nom = ?').bind(l.id, format, nom).run();
    await db.prepare('INSERT INTO fichiers (id, livraison_id, format, nom, cle, type, taille, largeur, hauteur, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, l.id, format, nom, cle, type, taille, Number(url.searchParams.get('l')) || null, Number(url.searchParams.get('h')) || null, maintenant()).run();
    return json({ ok: true, id });
  }
  if ((m = chemin.match(/^\/fichiers\/(fi_[A-Za-z0-9_]+)\/mini$/)) && methode === 'PUT') {
    if (!env.FICHIERS) return json({ erreur: 'Stockage absent' }, 503);
    const f = await db.prepare('SELECT f.*, l.statut, l.dossier FROM fichiers f JOIN livraisons l ON l.id = f.livraison_id WHERE f.id = ?').bind(m[1]).first();
    if (!f || f.statut !== 'brouillon') return json({ erreur: 'Introuvable' }, 404);
    if (Number(req.headers.get('Content-Length') || 0) > 3e6) return json({ erreur: 'Miniature trop lourde' }, 413);
    const cle = f.cle + '.mini.jpg';
    await env.FICHIERS.put(cle, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
    await db.prepare('UPDATE fichiers SET mini = ? WHERE id = ?').bind(cle, f.id).run();
    return json({ ok: true });
  }
  if ((m = chemin.match(/^\/fichiers\/(fi_[A-Za-z0-9_]+)$/)) && methode === 'DELETE') {
    const f = await db.prepare('SELECT f.id, l.statut FROM fichiers f JOIN livraisons l ON l.id = f.livraison_id WHERE f.id = ?').bind(m[1]).first();
    if (!f || f.statut !== 'brouillon') return json({ erreur: 'This file can no longer be removed.' }, 409);
    await db.prepare('DELETE FROM fichiers WHERE id = ?').bind(f.id).run();
    return json({ ok: true });
  }
  // l'admin supprime une version (un test, une erreur) : ses fichiers, leurs commentaires et le stockage
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)$/)) && methode === 'DELETE') {
    if (!admin) return json({ erreur: 'Accès refusé' }, 403);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l) return json({ erreur: 'Livraison introuvable' }, 404);
    const { results: fs } = await db.prepare('SELECT cle, mini FROM fichiers WHERE livraison_id = ?').bind(l.id).all();
    if (env.FICHIERS) for (const f of fs) { for (const k of [f.cle, f.mini]) if (k) { try { await env.FICHIERS.delete(k); } catch (e) {} } }
    await db.batch([db.prepare('DELETE FROM commentaires WHERE livraison_id = ? OR fichier_id IN (SELECT id FROM fichiers WHERE livraison_id = ?)').bind(l.id, l.id),
      db.prepare('DELETE FROM fichiers WHERE livraison_id = ?').bind(l.id), db.prepare('DELETE FROM livraisons WHERE id = ?').bind(l.id)]);
    return json({ ok: true, message: 'Version ' + l.version + ' de ' + l.dossier + ' supprimée.' });
  }
  // la designer envoie sa version à Kreative
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/envoyer$/)) && methode === 'POST') {
    const b = await corpsJson(req);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l || l.statut !== 'brouillon') return json({ erreur: 'This delivery was already sent.' }, 409);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM fichiers WHERE livraison_id = ?').bind(l.id).first();
    if (!n || !n.n) return json({ erreur: 'Add your files first.' }, 400);
    const ch = await db.prepare("UPDATE livraisons SET statut = 'a_verifier', depose_le = ?, note_designer = ? WHERE id = ? AND statut = 'brouillon'").bind(maintenant(), propre(b.note, 600) || null, l.id).run();
    if (!ch.meta || ch.meta.changes !== 1) return json({ erreur: 'This delivery was already sent.' }, 409);
    await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
    // Kreative est prévenu sur Telegram par le workflow « Livraison » (sauf un projet de démo)
    if (!/^TEST_DEMO_/.test(l.dossier)) {
      const appel = fetch(env.N8N_LIVRAISON || N8N_LIVRAISON, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier: l.dossier, lien: url.origin + '/admin/#/livraisons/' + l.dossier, note: (l.version > 1 ? 'Version ' + l.version + '. ' : '') + (propre(b.note, 500) || '') }) }).catch(() => null);
      if (ctx && ctx.waitUntil) ctx.waitUntil(appel); else await appel;
    }
    return json({ ok: true, message: 'Thank you! Kreative has been notified and will check your files.' });
  }
  // Kreative : envoyer au client, ou renvoyer (à la designer, ou au stratégiste pour les textes)
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/decision$/)) && methode === 'POST') {
    if (!admin) return json({ erreur: 'Accès refusé' }, 403);
    const b = await corpsJson(req);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l || l.statut !== 'a_verifier') return json({ erreur: 'Cette version n\'est plus à vérifier.' }, 409);
    if (b.action === 'corriger') {
      const pour = b.pour === 'strategiste' ? 'strategiste' : 'designer';
      if (!await renvoyerVersion(db, l, pour, propre(b.note, 1000))) return json({ erreur: 'Cette version n\'est plus à vérifier.' }, 409);
      return json({ ok: true, message: pour === 'strategiste' ? 'Renvoyée au stratégiste (textes).' : 'Renvoyée à la designer.' });
    }
    if (b.action !== 'envoyer') return json({ erreur: 'Action inconnue' }, 400);
    if (!await envoyerAuClient(env, ctx, url, db, l)) return json({ erreur: 'Cette version a déjà été envoyée.' }, 409);
    return json({ ok: true, message: 'Envoyée au client.' });
  }
  // les retours du client : qui s'en occupe (Kreative peut changer)
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/retouche$/)) && methode === 'POST') {
    if (!admin) return json({ erreur: 'Accès refusé' }, 403);
    const b = await corpsJson(req);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l || !['a_corriger', 'review_terminee'].includes(l.statut)) return json({ erreur: 'Pas de retouches en cours sur cette version.' }, 409);
    const pour = b.pour === 'strategiste' ? 'strategiste' : 'designer';
    await db.prepare('UPDATE livraisons SET retouche = ?, retouche_le = ? WHERE id = ?').bind(pour, maintenant(), l.id).run();
    await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
    return json({ ok: true, message: pour === 'strategiste' ? 'Retouches confiées au stratégiste.' : 'Retouches confiées à la designer.' });
  }
  // le stratégiste a corrigé les textes : la designer prend la suite
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/retouches-faites$/)) && methode === 'POST') {
    if (!['admin', 'strategiste'].includes(qui.role)) return json({ erreur: 'Accès refusé' }, 403);
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l || !['a_corriger', 'review_terminee'].includes(l.statut) || l.retouche !== 'strategiste') return json({ erreur: 'Rien à corriger de votre côté sur ce projet.' }, 409);
    const b = await corpsJson(req), note = propre(b.note, 600);
    await db.prepare("UPDATE livraisons SET retouche = 'designer', retouche_le = ?, note_kreative = COALESCE(?, note_kreative) WHERE id = ?")
      .bind(maintenant(), note ? 'Textes corrigés par le stratégiste : ' + note : null, l.id).run();
    await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
    return json({ ok: true, message: 'Merci, la nouvelle version va être préparée avec tes textes.' });
  }
  // l'état de chaque projet, le même pour tout le monde (admin, stratégiste, designer)
  if (chemin === '/etats' && methode === 'GET') {
    const e = await etatsProduction(db);
    if (!admin) for (const o of [e.etats, e.commandes, e.options]) for (const d of Object.keys(o)) if (cache(d)) delete o[d];
    return json(e);
  }
  // le Kanban : un projet glissé d'une colonne à l'autre
  if (chemin === '/deplacer' && methode === 'POST') {
    if (!admin) return json({ erreur: 'Accès refusé' }, 403);
    const b = await corpsJson(req);
    const dossier = propre(b.dossier, 80), vers = String(b.vers || '');
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(dossier) || !['strat', 'desi', 'livrer', 'client'].includes(vers)) return json({ erreur: 'Déplacement invalide.' }, 400);
    const r = await deplacerProjet(env, ctx, url, db, dossier, vers, qui, b.confirme === true);
    return json({ ...r, ok: !r.erreur, etats: await etatsProduction(db) });
  }
  // un commentaire de l'équipe (interne : le client ne le voit pas)
  if (chemin === '/commentaires' && methode === 'POST') {
    const b = await corpsJson(req);
    const f = await db.prepare('SELECT id, livraison_id FROM fichiers WHERE id = ?').bind(propre(b.fichier_id, 40)).first();
    if (!f) return json({ erreur: 'Fichier introuvable' }, 404);
    const texte = propre(b.texte, 2000);
    if (!texte) return json({ erreur: 'Écrivez un commentaire.' }, 400);
    const r = await db.prepare('INSERT INTO commentaires (fichier_id, livraison_id, auteur, role, texte, forme, couleur, interne, cree_le) VALUES (?,?,?,?,?,?,?,1,?)')
      .bind(f.id, f.livraison_id, qui.nom.charAt(0).toUpperCase() + qui.nom.slice(1), qui.role, texte, formeValide(b.forme), couleurValide(b.couleur), maintenant()).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if ((m = chemin.match(/^\/commentaires\/(\d+)$/)) && methode === 'DELETE') {
    const c = await db.prepare('SELECT * FROM commentaires WHERE id = ?').bind(Number(m[1])).first();
    if (!c || (!admin && c.role !== qui.role)) return json({ erreur: 'Introuvable' }, 404);
    await db.prepare('DELETE FROM commentaires WHERE id = ?').bind(c.id).run();
    return json({ ok: true });
  }
  return json({ erreur: 'Introuvable' }, 404);
}
// une annotation : rectangle, cercle ou flèche, en coordonnées relatives (0 à 1)
function formeValide(f) {
  if (!f || typeof f !== 'object' || !['rect', 'cercle', 'fleche'].includes(f.t)) return null;
  const n = v => Math.min(1, Math.max(0, Number(v) || 0));
  return JSON.stringify({ t: f.t, x1: n(f.x1), y1: n(f.y1), x2: n(f.x2), y2: n(f.y2) });
}
const couleurValide = c => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : '#e5484d';

// ---------- API du client : sa review ----------
async function apiClientLivraisons(req, env, ctx, url, chemin, methode, cl, apercu) {
  const db = await baseLiv(env);
  let m;
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9_]+)\/creatives$/)) && methode === 'GET') {
    const k = await db.prepare('SELECT * FROM commandes WHERE id = ? AND client_id = ?').bind(m[1], cl.id).first();
    if (!k) return json({ erreur: 'Commande introuvable' }, 404);
    if (!k.dossier) return json({ livraisons: [] });
    const { results } = await db.prepare(`SELECT * FROM livraisons WHERE (dossier = ? OR dossier LIKE ?) AND statut IN ('envoyee','review_terminee','approuvee')
      ORDER BY dossier, version DESC`).bind(k.dossier, k.dossier + '_L%').all();
    const filtre = results.filter(l => l.dossier === k.dossier || new RegExp('^' + k.dossier + '_L\\d+$').test(l.dossier));
    const livs = await Promise.all(filtre.map(l => detailLivraison(db, l, true)));
    // pour chaque dossier de livraison (1/2, 2/2…), le numéro et le total
    for (const l of livs) { const d = await lireJsonDepot(env, l.dossier + '/donnees.json'); const x = d && d.livraison; l.partie = x && x.sur > 1 ? { n: x.n, sur: x.sur } : null; }
    return json({ livraisons: livs });
  }
  if (methode !== 'GET' && apercu) return json({ erreur: 'Aperçu : rien n\'est enregistré à la place du client.' }, 403);
  if ((m = chemin.match(/^\/fichiers\/(fi_[A-Za-z0-9_]+)\/approuver$/)) && methode === 'POST') {
    const f = await db.prepare('SELECT * FROM fichiers WHERE id = ?').bind(m[1]).first();
    const l = f && await livraisonDuClient(db, cl, f.livraison_id);
    if (!l || l.statut !== 'envoyee') return json({ erreur: 'Cette version n\'est plus en review.' }, 409);
    const b = await corpsJson(req);
    await db.prepare('UPDATE fichiers SET approuve_le = ? WHERE id = ?').bind(b.oui === false ? null : maintenant(), f.id).run();
    return json({ ok: true });
  }
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/tout-approuver$/)) && methode === 'POST') {
    const l = await livraisonDuClient(db, cl, m[1]);
    if (!l || l.statut !== 'envoyee') return json({ erreur: 'Cette version n\'est plus en review.' }, 409);
    await db.prepare('UPDATE fichiers SET approuve_le = COALESCE(approuve_le, ?) WHERE livraison_id = ?').bind(maintenant(), l.id).run();
    return json({ ok: true });
  }
  if (chemin === '/commentaires' && methode === 'POST') {
    const b = await corpsJson(req);
    const f = await db.prepare('SELECT * FROM fichiers WHERE id = ?').bind(propre(b.fichier_id, 40)).first();
    const l = f && await livraisonDuClient(db, cl, f.livraison_id);
    if (!l || l.statut !== 'envoyee') return json({ erreur: 'Cette version n\'est plus en review.' }, 409);
    const texte = propre(b.texte, 2000);
    if (!texte) return json({ erreur: 'Écrivez votre commentaire.' }, 400);
    const r = await db.prepare('INSERT INTO commentaires (fichier_id, livraison_id, auteur, role, texte, forme, couleur, interne, cree_le) VALUES (?,?,?,?,?,?,?,0,?)')
      .bind(f.id, l.id, propre(cl.contact, 80) || cl.marque, 'client', texte, formeValide(b.forme), couleurValide(b.couleur), maintenant()).run();
    await db.prepare('UPDATE fichiers SET approuve_le = NULL WHERE id = ?').bind(f.id).run();
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if ((m = chemin.match(/^\/commentaires\/(\d+)$/)) && methode === 'DELETE') {
    const c = await db.prepare('SELECT * FROM commentaires WHERE id = ? AND role = ?').bind(Number(m[1]), 'client').first();
    const l = c && await livraisonDuClient(db, cl, c.livraison_id);
    if (!l || l.statut !== 'envoyee') return json({ erreur: 'Introuvable' }, 404);
    await db.prepare('DELETE FROM commentaires WHERE id = ?').bind(c.id).run();
    return json({ ok: true });
  }
  // fin de la review : tout est approuvé (projet validé) ou des retouches sont demandées
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/terminer$/)) && methode === 'POST') {
    const l = await livraisonDuClient(db, cl, m[1]);
    if (!l || l.statut !== 'envoyee') return json({ erreur: 'Cette review est déjà terminée.' }, 409);
    // une seule fin de review, même avec deux clics
    const pris = await db.prepare("UPDATE livraisons SET review_le = ? WHERE id = ? AND statut = 'envoyee' AND review_le IS NULL").bind(maintenant(), l.id).run();
    if (!pris.meta || pris.meta.changes !== 1) return json({ erreur: 'Cette review est déjà terminée.' }, 409);
    const t = await db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN approuve_le IS NULL THEN 1 ELSE 0 END) AS reste,
      (SELECT COUNT(*) FROM commentaires WHERE livraison_id = ? AND interne = 0) AS coms FROM fichiers WHERE livraison_id = ?`).bind(l.id, l.id).first();
    const now = maintenant(), k = await commandeDuDossier(db, l.dossier);
    if (!t.reste) {
      await db.prepare("UPDATE livraisons SET statut = 'approuvee', review_le = ? WHERE id = ?").bind(now, l.id).run();
      let valide = false;
      // Wimmov : son mois (60 créas) n'est terminé qu'à la 4e livraison ; des créas en plus, dès la 1re
      const derniere = DOSSIER_WIMMOV.test(l.dossier) ? !k || k.formule !== 'mensuel' || Number((l.dossier.match(/_L(\d+)$/) || [])[1] || 0) >= WIMMOV.livraisons_mois
        : await estDerniereLivraison(env, l.dossier);
      if (k && derniere && !['valide', 'annule'].includes(k.statut)) {
        await db.prepare("UPDATE commandes SET statut = 'valide', valide_le = ? WHERE id = ?").bind(now, k.id).run();
        await noter(db, cl.id, k.id, 'valide', 'Créatives validées · projet terminé');
        valide = true;
      } else if (k) {
        // une partie approuvée (1/2…) : la commande continue, la suite est en production
        if (k.statut === 'revisions') await db.prepare("UPDATE commandes SET statut = 'production' WHERE id = ?").bind(k.id).run();
        await noter(db, cl.id, k.id, 'valide', 'Livraison approuvée');
      }
      return json({ ok: true, approuvee: true, valide, commande: k && k.id });
    }
    const { results: CO } = await db.prepare('SELECT texte FROM commentaires WHERE livraison_id = ? AND interne = 0').bind(l.id).all();
    const pour = pourQui(CO.map(c => c.texte));
    await db.prepare("UPDATE livraisons SET statut = 'review_terminee', review_le = ?, retouche = ?, retouche_le = ? WHERE id = ?").bind(now, pour, now, l.id).run();
    await db.prepare('DELETE FROM prod_etapes WHERE dossier = ?').bind(l.dossier).run();
    if (k && !['valide', 'annule'].includes(k.statut)) await db.prepare("UPDATE commandes SET statut = 'revisions' WHERE id = ?").bind(k.id).run();
    if (k) await noter(db, cl.id, k.id, 'revisions', 'Vos retours sont transmis · retouches en cours');
    // Kreative est prévenu par email
    const lienAdmin = DOSSIER_WIMMOV.test(l.dossier) ? url.origin + '/admin/#/wimmov/livraison/' + l.dossier : url.origin + '/admin/#/livraisons/' + l.dossier;
    const envoi = envoyerEmail(env, { type: 'review', a: env.EMAIL_KREATIVE || 'contact@kreativeads.fr', marque: cl.marque, contact: 'Kreative', lien: lienAdmin,
      sujet: cl.marque + ' · retours du client sur la version ' + l.version,
      html: emailHtml(url.origin, { titre: cl.marque + ' a terminé sa review', paragraphes: [(t.n - t.reste) + ' fichier' + (t.n - t.reste > 1 ? 's' : '') + ' approuvé' + (t.n - t.reste > 1 ? 's' : '') + ' sur ' + t.n + ', ' + t.coms + ' commentaire' + (t.coms > 1 ? 's' : '') + '. ' + (pour === 'strategiste' ? 'Les retours parlent des textes : le stratégiste corrige d\'abord, puis la designer fait la nouvelle version.' : 'La designer voit les retours dans son espace et prépare la nouvelle version.') + ' Vous pouvez changer qui s\'en occupe depuis la livraison.'],
        bouton: ['Voir les retours', lienAdmin] }) });
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
    return json({ ok: true, approuvee: false });
  }
  return null;
}

// ---------- servir un fichier livré (équipe, ou le client de ce projet) ----------
async function servirFichier(req, env, ctx, url, id) {
  const db = await baseLiv(env);
  const f = await db.prepare('SELECT * FROM fichiers WHERE id = ?').bind(id).first();
  if (!f) return texte('Introuvable', 404);
  const equipe = await session(req, env);
  if (!equipe) {
    const cl = await sessionClient(req, env);
    if (!cl || !(await livraisonDuClient(db, cl, f.livraison_id))) return texte('Accès refusé', 403);
  } else if (!['admin', 'designer', 'strategiste'].includes(equipe.role)) return texte('Accès refusé', 403);
  else if (equipe.role !== 'admin') {
    const l = await db.prepare('SELECT dossier FROM livraisons WHERE id = ?').bind(f.livraison_id).first();
    if (l && DOSSIER_WIMMOV.test(l.dossier)) return texte('Introuvable', 404);
  }
  const mini = url.searchParams.has('mini') && f.mini, cle = mini ? f.mini : f.cle;
  const entetes = { 'Cache-Control': 'private, max-age=86400' };
  if (url.searchParams.has('dl')) entetes['Content-Disposition'] = 'attachment; filename="' + f.nom.replace(/"/g, '') + '"';
  // fichiers de démonstration : des images du dépôt
  if (String(cle).startsWith('depot:')) {
    const r = await lireGithub(cle.slice(6), env, 'GET');
    if (!r.ok) return texte('Introuvable', 404);
    return new Response(r.body, { headers: { ...entetes, 'Content-Type': f.type || 'image/jpeg' } });
  }
  if (!env.FICHIERS) return texte('Stockage absent', 503);
  const o = await env.FICHIERS.get(cle);
  if (!o) return texte('Introuvable', 404);
  return new Response(o.body, { headers: { ...entetes, 'Content-Type': (o.httpMetadata && o.httpMetadata.contentType) || f.type || 'application/octet-stream', 'ETag': o.httpEtag } });
}

// ---------- n8n : relier le brief Fillout à sa commande ----------
// Appelé par les workflows des briefs (en-tête X-Kreative-Cle = CLE) avec le
// dossier créé et ce que le portail a mis dans le lien du formulaire.
// les réponses Fillout, gardées propres : la question, puis un texte ou des fichiers
function briefPropre(questions) {
  if (!Array.isArray(questions)) return [];
  const sortie = []; let taille = 0;
  for (const q of questions.slice(0, 120)) {
    if (!q || typeof q !== 'object') continue;
    const nom = propre(q.name || q.question || q.label, 300), v = q.value !== undefined ? q.value : q.reponse;
    if (!nom || v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    let r;
    if (Array.isArray(v) && v.every(x => x && typeof x === 'object' && x.url)) r = { fichiers: v.slice(0, 20).map(x => ({ url: String(x.url).slice(0, 600), nom: propre(x.filename || x.name || 'fichier', 120) })).filter(x => /^https:\/\//.test(x.url)) };
    else if (Array.isArray(v)) r = { texte: propre(v.map(x => x && typeof x === 'object' ? (x.label || x.value || JSON.stringify(x)) : x).join(', '), 4000) };
    else if (typeof v === 'object') r = { texte: propre(Object.values(v).filter(x => x !== null && x !== '').join(', '), 4000) };
    else if (typeof v === 'boolean') r = { texte: v ? 'Oui' : 'Non' };
    else r = { texte: propre(String(v), 4000) };
    if (!r.texte && !(r.fichiers && r.fichiers.length)) continue;
    taille += nom.length + JSON.stringify(r).length;
    if (taille > 90000) break;
    sortie.push({ q: nom, ...r });
  }
  return sortie;
}
// Le « brief suivant » (formulaire de retour) : après la livraison 1 d'un projet en plusieurs fois
// (pour préparer la 2), et pour un abonnement, sur la commande du mois suivant.
// Le rythme d'un Custom livré en plusieurs fois (30/10/2026) : calé sur le jour où le client a reçu la livraison 1,
// puis tous les 15 jours (en 2 fois) ou chaque semaine (en 4 fois), voir calendrierLot. Le brief de la livraison n
// est demandé la veille du jour où l'équipe la démarre (sa date moins son délai), jamais avant que la livraison
// précédente soit chez le client, et toujours dans un message à part. Un brief rempli en retard ne décale pas les suivants.
const intervalleJours = sur => sur >= 4 ? 7 : 15;
function briefSuivantLe(k, n, sur, livreLe, l1Recue) {
  const c = calendrierLot(k, n, sur, l1Recue || null);
  return Math.max(livreLe || 0, c.debut - 864e5);
}
// la partie (n sur sur) d'un dossier livré en plusieurs fois
async function partieDe(env, dossier) {
  let d = await lireJsonDepot(env, dossier + '/donnees.json'), l = d && d.livraison;
  if (!(l && l.sur > 1) && !/_L\d+$/.test(dossier)) { d = await lireJsonDepot(env, dossier + '_L1/donnees.json'); l = d && d.livraison; }
  return l && l.sur > 1 ? { n: Number(l.n) || 1, sur: Number(l.sur) } : null;
}
async function briefsSuivants(env, cl, commandes, L) {
  const db = await baseLiv(env);
  const { results: R } = await db.prepare('SELECT * FROM retours WHERE client_id = ? ORDER BY recu_le').bind(cl.id).all();
  const faits = new Set(R.map(r => r.apres));
  const envoyes = new Set(L.map(l => l.dossier));
  for (const c of commandes) {
    c.retours = R.filter(r => r.commande_id === c.id || (c.dossier && baseDossier(r.apres) === baseDossier(c.dossier)))
      .map(r => { let rep = []; try { rep = JSON.parse(r.reponses || '[]'); } catch (e) {} return { apres: r.apres, suivante: r.suivante, recu_le: r.recu_le, commande_id: r.commande_id, reponses: rep }; });
    if (!c.dossier || ['annule', 'valide'].includes(c.statut)) continue;
    // un projet en plusieurs livraisons : la partie n est chez le client, le brief de la partie n+1 n'est pas encore là
    const base = baseDossier(c.dossier);
    let d = await lireJsonDepot(env, c.dossier + '/donnees.json'); let l = d && d.livraison;
    if (!(l && l.sur > 1)) { d = await lireJsonDepot(env, base + '_L1/donnees.json'); l = d && d.livraison; }
    if (l && l.sur > 1) {
      for (let n = 1; n < l.sur; n++) {
        const partie = [base + '_L' + n, n === 1 ? base : null].find(x => x && envoyes.has(x));
        if (!partie) break;
        if (!faits.has(partie)) {
          const livre = Math.min(...L.filter(x => x.dossier === partie).map(x => x.envoye_le || Infinity));
          const l1 = Math.min(...L.filter(x => x.dossier === base + '_L1' || (n === 1 && x.dossier === partie)).map(x => x.envoye_le || Infinity));
          const le = briefSuivantLe(c, n + 1, l.sur, isFinite(livre) ? livre : 0, isFinite(l1) ? l1 : null);
          if (maintenant() >= le) c.brief_suivant = { dossier: partie, n: n + 1, sur: l.sur };
          else c.brief_prochain = { n: n + 1, sur: l.sur, le };
          break;
        }
      }
    }
  }
  // un abonnement : la commande du nouveau mois attend son brief, préparé à partir du mois d'avant
  for (const c of commandes) {
    if (c.formule !== 'mensuel' || c.statut !== 'brief') continue;
    const avant = commandes.filter(x => x !== c && x.formule === 'mensuel' && x.dossier && (x.cree_le || 0) < (c.cree_le || 0)).sort((a, b) => b.cree_le - a.cree_le)[0];
    if (avant) c.brief_mois = { dossier: avant.dossier };
  }
}
async function apiN8n(req, env, ctx, url, chemin, methode) {
  if (!env.CLE || !egal(req.headers.get('X-Kreative-Cle') || '', env.CLE)) return json({ erreur: 'Accès refusé' }, 403);
  const db = await base(env);
  // envoyer les briefs arrivés à leur date (le déclencheur Cron le fait seul ; ceci sert de secours et au banc de test)
  if (chemin === '/rappels' && methode === 'POST') {
    const b = await corpsJson(req);
    return json({ envoyes: await rappelsDus(env, url, env.PUSH_TEST && b.a ? Number(b.a) : null) });
  }
  if (chemin === '/brief' && methode === 'POST') {
    const b = await corpsJson(req);
    const dossier = propre(b.dossier, 80);
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(dossier)) return json({ erreur: 'dossier invalide' }, 400);
    const ref = propre(b.commande, 20).replace(/^#/, ''), idClient = propre(b.client, 40), email = propre(b.email, 160).toLowerCase();
    let k = ref ? await db.prepare('SELECT * FROM commandes WHERE ref = ?').bind(ref).first() : null;
    // un lien modifié ou partagé ne relie jamais le brief à la commande d'un autre client
    if (k && idClient && k.client_id !== idClient) k = null;
    if (k && !idClient && emailValide(email)) { const c = await db.prepare('SELECT email FROM clients WHERE id = ?').bind(k.client_id).first(); if (!c || String(c.email || '').toLowerCase() !== email) k = null; }
    if (!k && idClient) k = await db.prepare("SELECT * FROM commandes WHERE client_id = ? AND statut = 'brief' ORDER BY cree_le LIMIT 1").bind(idClient).first();
    if (!k && emailValide(email)) k = await db.prepare(`SELECT k.* FROM commandes k JOIN clients c ON c.id = k.client_id
      WHERE lower(c.email) = ? AND k.statut = 'brief' ORDER BY k.cree_le LIMIT 1`).bind(email).first();
    if (!k) return json({ ok: false, message: 'Aucune commande en attente de brief pour ce client : à relier à la main dans l\'admin.' });
    if (k.dossier && k.dossier !== dossier) return json({ ok: false, message: 'La commande #' + k.ref + ' est déjà reliée au dossier ' + k.dossier + '.' });
    await db.prepare("UPDATE commandes SET dossier = ?, brief_le = COALESCE(brief_le, ?), statut = CASE WHEN statut = 'brief' THEN 'production' ELSE statut END WHERE id = ?").bind(dossier, maintenant(), k.id).run();
    // le brief lui-même (questions et réponses), pour que le client le relise dans son espace
    const rep = briefPropre(b.questions);
    if (rep.length) await db.prepare('UPDATE commandes SET brief_json = ? WHERE id = ?').bind(JSON.stringify(rep), k.id).run();
    await noter(db, k.client_id, k.id, 'brief', 'Brief reçu, production lancée');
    return json({ ok: true, commande: k.ref });
  }
  // le formulaire de retour (brief suivant) : gardé pour le client, et pour un abonnement, il relie la commande du mois
  if (chemin === '/retour' && methode === 'POST') {
    const b = await corpsJson(req);
    const apres = propre(b.dossier, 80).replace(/[^A-Za-z0-9_-]/g, '');
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(apres)) return json({ erreur: 'dossier invalide' }, 400);
    const m = apres.match(/^(.*)_L(\d+)$/), suivante = m ? m[1] + '_L' + (Number(m[2]) + 1) : apres + '_L2';
    const ldb = await baseLiv(env);
    let k = await commandeDuDossier(ldb, apres);
    const idClient = propre(b.client, 40), ref = propre(b.commande, 40).replace(/^#/, '');
    // la commande du nouveau mois (abonnement), si le lien la donne : même client obligatoire
    let mois = ref ? await db.prepare('SELECT * FROM commandes WHERE ref = ?').bind(ref).first() : null;
    if (mois && (!idClient || mois.client_id !== idClient || (k && k.client_id !== mois.client_id))) mois = null;
    const clientId = (k && k.client_id) || (mois && mois.client_id) || null;
    if (!clientId) return json({ ok: false, message: 'Projet inconnu : le retour est gardé dans n8n seulement.' });
    const rep = briefPropre(b.questions);
    await ldb.prepare('INSERT INTO retours (apres, suivante, commande_id, client_id, reponses, recu_le) VALUES (?,?,?,?,?,?)')
      .bind(apres, suivante, mois ? mois.id : (k ? k.id : null), clientId, JSON.stringify(rep), maintenant()).run();
    if (mois && mois.statut === 'brief') {
      await db.prepare("UPDATE commandes SET dossier = COALESCE(dossier, ?), brief_le = COALESCE(brief_le, ?), statut = 'production', brief_json = COALESCE(brief_json, ?) WHERE id = ?")
        .bind(suivante, maintenant(), JSON.stringify(rep), mois.id).run();
      await noter(db, clientId, mois.id, 'brief', 'Brief du mois reçu, production lancée');
    } else if (k) await noter(db, clientId, k.id, 'brief', 'Brief de la livraison suivante reçu');
    return json({ ok: true, suivante });
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ============================================================
//  STRIPE : les factures arrivent seules
//  Stripe → Développeurs → Webhooks → point de terminaison
//  https://<ce site>/api/stripe/webhook, événements « invoice.* ».
//  Événements : checkout.session.completed et invoice.* .
//  Son code de signature va dans le secret STRIPE_WEBHOOK_SECRET.
//  La clé restreinte (Checkout Sessions en écriture) va dans STRIPE_SECRET :
//  elle sert seulement à créer les paiements depuis l'espace client.
//  La page de paiement Stripe s'ouvre dans un nouvel onglet : le portail reste
//  ouvert derrière et affiche la commande dès que le client revient.
//  Un paiement réussi crée la commande (et l'espace client si besoin) ;
//  chaque mois d'abonnement payé crée la commande du mois suivant.
//  La facture est rattachée au client par son email, et à une commande
//  si la facture porte la métadonnée « commande » (ex. 1004).
// ============================================================
// un paiement Stripe réussi : la commande se crée seule (et l'espace client
// aussi si c'est un nouveau client, avec son lien d'accès par email)
async function paiementRecu(env, ctx, url, s) {
  const db = await base(env);
  if (await db.prepare('SELECT id FROM commandes WHERE stripe_session = ?').bind(s.id).first()) return;     // déjà traité
  if (await paiementWimmov(env, ctx, url, s)) return;     // Wimmov : son contrat à part (voir WIMMOV)
  const meta = s.metadata || {};
  const email = String((s.customer_details && s.customer_details.email) || s.customer_email || '').toLowerCase();
  const idClient = meta.kreative_client || (/^c_[A-Za-z0-9_]+$/.test(String(s.client_reference_id || '')) ? s.client_reference_id : null);
  let cl = idClient ? await db.prepare('SELECT * FROM clients WHERE id = ?').bind(String(idClient)).first() : null;
  if (!cl && s.customer) cl = await db.prepare('SELECT * FROM clients WHERE stripe_client = ?').bind(String(s.customer)).first();
  if (!cl && email) cl = await db.prepare('SELECT * FROM clients WHERE lower(email) = ?').bind(email).first();
  let nouveau = false;
  const det = s.customer_details || {};
  // les questions du paiement (« Nom de votre marque », « Site web ou Instagram »), aussi celles ajoutées à un lien Stripe
  const champ = re => { const f = (s.custom_fields || []).find(x => re.test(String(x.key || '') + ' ' + String((x.label && x.label.custom) || ''))); return f ? String((f.text && f.text.value) || (f.dropdown && f.dropdown.value) || '').trim() : ''; };
  const repMarque = champ(/marque|brand|entreprise|soci/i), repSite = champ(/site|insta|web/i);
  if (!cl) {
    if (!emailValide(email)) return;
    const id = 'c_' + aleatoire(10), jeton = aleatoire(32);
    const info = s.collected_information || {};
    const marque = propre((repMarque || info.business_name || det.business_name || det.name || info.individual_name || email.split('@')[0]), 80);
    await db.prepare('INSERT INTO clients (id, marque, contact, email, telephone, site, jeton, cree_le) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, marque, propre(info.individual_name || det.individual_name || det.name, 80), email, propre(det.phone, 40), propre(repSite, 200) || null, jeton, maintenant()).run();
    await noter(db, id, null, 'client', 'Espace client créé');
    cl = { id, marque, contact: info.individual_name || det.individual_name || det.name || '', email, jeton };
    nouveau = true;
  } else if (det.phone || repSite) {
    // un client déjà connu : on complète seulement ce qui manque
    await db.prepare("UPDATE clients SET telephone = CASE WHEN COALESCE(telephone,'') = '' THEN ? ELSE telephone END, site = CASE WHEN COALESCE(site,'') = '' THEN ? ELSE site END WHERE id = ?")
      .bind(propre(det.phone, 40) || null, propre(repSite, 200) || null, cl.id).run();
  }
  if (s.customer && !cl.stripe_client) await db.prepare('UPDATE clients SET stripe_client = ? WHERE id = ?').bind(String(s.customer), cl.id).run();
  // le pack : dans les métadonnées (portail), sinon déduit du montant (liens du site)
  const total = (s.amount_total || 0) / 100, mensuel = s.mode === 'subscription';
  // le pack : dans les métadonnées (Custom), sinon le lien de paiement utilisé, sinon le montant
  let pack = PACKS[meta.pack] ? meta.pack : null;
  if (!pack && s.payment_link) { const l = packDuLien(String(s.payment_link)); if (l) pack = l.pack; }
  if (!pack) pack = Object.keys(PACKS).find(k => PACKS[k][mensuel ? 'mensuel' : 'unique'] === total) || 'custom';
  const nb = Number(meta.nb_creas) || PACKS[pack].creas;
  const r = await creerCommande(db, { client_id: cl.id, pack, formule: mensuel ? 'mensuel' : 'unique', nb, prix: total,
    options: meta.options ? String(meta.options).split(',').filter(Boolean) : [], stripe_session: s.id,
    stripe_abo: typeof s.subscription === 'string' ? s.subscription : null, stripe_facture: typeof s.invoice === 'string' ? s.invoice : null,
    texte: 'Paiement reçu, commande confirmée' });
  if (typeof s.invoice === 'string') {
    await db.prepare('UPDATE factures SET commande_id = COALESCE(commande_id, ?), client_id = COALESCE(client_id, ?) WHERE stripe_id = ?').bind(r.id, cl.id, s.invoice).run();
    // la facture est parfois arrivée avant le paiement : son numéro devient tout de suite celui de la commande
    const f = await db.prepare('SELECT numero FROM factures WHERE stripe_id = ?').bind(s.invoice).first();
    if (f && f.numero) await numeroDeCommande(db, r.id, s.invoice, f.numero);
  }
  if (nouveau && cl.jeton) {
    const envoi = envoyerEmail(env, emailAcces(url, { ...cl, email }, lienAcces(url, cl.jeton)));
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
  }
}
// une session de paiement Stripe au montant exact (pack, formule, options) : depuis le portail
// (client connu) ou depuis la landing (le compte est créé au paiement)
function sessionStripe(d, o) {
  const m = d.formule === 'mensuel', cl = o.client;
  const meta = { pack: d.pack, formule: d.formule, nb_creas: String(d.nb), options: d.options.join(','), total: String(d.total) };
  if (cl) meta.kreative_client = cl.id; else meta.source = 'landing';
  const p = {
    mode: m ? 'subscription' : 'payment', locale: 'fr', metadata: meta,
    success_url: o.succes, cancel_url: o.annule,
    allow_promotion_codes: 'true',
    // depuis le site : l'email, le nom sur la carte et le nom de l'entreprise, rien de plus (l'adresse de la carte suffit pour la facture)
    billing_address_collection: cl ? 'required' : 'auto', tax_id_collection: cl ? { enabled: 'true' } : undefined,
    consent_collection: { terms_of_service: 'required' },   // comme les liens de paiement : les CGV à accepter
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: String(Math.round(d.total * 100)),
      product_data: { name: d.nom, description: d.description }, recurring: m ? { interval: 'month' } : undefined } }]
  };
  if (cl) {
    p.client_reference_id = cl.id;
    // client Stripe déjà connu : Stripe exige l'autorisation de mettre à jour son nom (n° de TVA) et son adresse
    if (cl.stripe_client) { p.customer = cl.stripe_client; p.customer_update = { name: 'auto', address: 'auto' }; }
    else if (cl.email) p.customer_email = cl.email;
  }
  else {
    // depuis le site : les champs natifs de Stripe « Nom de l'entreprise » (le nom de son espace) et « Nom » (le contact)
    p.name_collection = { business: { enabled: 'true', optional: 'false' }, individual: { enabled: 'true', optional: 'false' } };
  }
  if (m) {
    p.subscription_data = { metadata: Object.assign({ engagement_mois: String(ENGAGEMENT_MOIS) }, meta) };
    // l'engagement, écrit sur la page de paiement Stripe, juste au-dessus du bouton
    p.custom_text = { submit: { message: 'Abonnement mensuel avec engagement de ' + ENGAGEMENT_MOIS + ' mois. Une fois le ' + ENGAGEMENT_MOIS + 'e mois payé, résiliable depuis votre espace client, avec effet à la fin du mois en cours.' } };
  }
  else {
    p.invoice_creation = { enabled: 'true', invoice_data: { metadata: meta, description: d.description } };   // le détail (créas, formats, options) sur la facture
    p.payment_intent_data = { metadata: meta };
    if (!cl || !cl.stripe_client) p.customer_creation = 'always';
  }
  return p;
}
async function numeroDeCommande(db, commandeId, factureId, numero) {
  try {
    await db.prepare('UPDATE commandes SET ref = ?, stripe_facture = COALESCE(stripe_facture, ?) WHERE id = ? AND (stripe_facture IS NULL OR stripe_facture = ?) AND ref != ?')
      .bind(String(numero), factureId, commandeId, factureId, String(numero)).run();
  } catch (e) {}
}
function formulaireStripe(o, prefixe, sortie) {
  sortie = sortie || [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? prefixe + '[' + k + ']' : k;
    if (typeof v === 'object') formulaireStripe(v, cle, sortie);
    else sortie.push(encodeURIComponent(cle) + '=' + encodeURIComponent(v));
  }
  return sortie.join('&');
}
async function appelStripe(env, chemin, params) {
  const r = await fetch((env.STRIPE_API || 'https://api.stripe.com') + '/v1/' + chemin, { method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET, 'Content-Type': 'application/x-www-form-urlencoded' }, body: formulaireStripe(params) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || ('erreur ' + r.status));
  return d;
}
async function lireStripe(env, chemin) {
  const r = await fetch((env.STRIPE_API || 'https://api.stripe.com') + '/v1/' + chemin, { headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || ('erreur ' + r.status));
  return d;
}
// l'offre pour rester, proposée quand un client veut résilier : le coupon Stripe d'ID « FIDELITE », créé par Kreative
// dans Stripe (sa valeur et sa durée y sont réglées, le portail les lit). Pas de coupon : pas d'offre.
const COUPON_FIDELITE = 'FIDELITE';
let OFFRE_CACHE = null;
async function offreFidelite(env) {
  if (!env.STRIPE_SECRET) return null;
  if (OFFRE_CACHE && OFFRE_CACHE.fin > Date.now()) return OFFRE_CACHE.v;
  let v = null;
  try {
    const c = await lireStripe(env, 'coupons/' + COUPON_FIDELITE);
    if (c && c.valid !== false && (c.percent_off || c.amount_off)) {
      const remise = c.percent_off ? '-' + String(c.percent_off).replace('.', ',') + ' %' : '-' + Math.round(c.amount_off / 100) + ' €';
      const duree = c.duration === 'forever' ? 'sur tous vos prochains mois' : c.duration === 'repeating' && c.duration_in_months > 1 ? 'pendant vos ' + c.duration_in_months + ' prochains mois' : 'sur votre prochain mois';
      v = { remise, duree, texte: remise + ' ' + duree };
    }
  } catch (e) {}
  OFFRE_CACHE = { v, fin: Date.now() + 10 * 60000 };
  return v;
}
async function hmacHex(secret, texteASigner) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texteASigner));
  return Array.from(new Uint8Array(s), x => x.toString(16).padStart(2, '0')).join('');
}
async function stripeWebhook(req, env, ctx, url) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ erreur: 'Webhook Stripe pas encore configuré' }, 503);
  const corps = await req.text();
  const morceaux = (req.headers.get('Stripe-Signature') || '').split(',').map(x => x.split('='));
  const t = (morceaux.find(x => x[0] === 't') || [])[1];
  const v1 = morceaux.filter(x => x[0] === 'v1').map(x => x[1]);
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 600) return json({ erreur: 'Signature absente ou expirée' }, 400);
  const attendu = await hmacHex(env.STRIPE_WEBHOOK_SECRET, t + '.' + corps);
  if (!v1.some(v => egal(v, attendu))) return json({ erreur: 'Signature invalide' }, 400);
  let ev; try { ev = JSON.parse(corps); } catch (e) { return json({ erreur: 'JSON invalide' }, 400); }
  const o = ev && ev.data && ev.data.object;
  if (!o) return json({ recu: true });
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    if (o.payment_status === 'paid' || o.payment_status === 'no_payment_required') await paiementRecu(env, ctx, url, o);
  } else if (/^invoice\./.test(ev.type || '')) await enregistrerFacture(env, o, url);
  else if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') await abonnementChange(env, o, ev.created || Math.floor(Date.now() / 1000));
  return json({ recu: true });
}
// ---------- abonnements : engagement de 3 mois, puis résiliable à tout moment depuis l'espace client ----------
// Un abonnement = les commandes mensuelles d'un même abonnement Stripe (une par mois payé).
// Engagement de 3 mois, tous les packs : le bouton s'active une fois le 3e mois débité, et la résiliation
// prend effet à la fin du mois en cours, déjà payé (Stripe : cancel_at_period_end). Le client paie donc ses 3 mois,
// jamais un 4e. Côté Stripe aussi : une résiliation programmée avant la fin du 3e mois (tableau de bord, autre outil)
// est repoussée automatiquement à cette date (voir abonnementChange).
const ENGAGEMENT_MOIS = 3;
// ajoute n mois comme Stripe (le 31 janvier + 1 mois = le 28 ou 29 février), à partir de la date d'ancrage
const moisStripe = (sec, n) => { const d = new Date(sec * 1000), jour = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(jour, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return Math.floor(d.getTime() / 1000); };
// la première date à laquelle l'abonnement peut s'arrêter : la fin du 3e mois
const finMinimale = s => { const a = s.billing_cycle_anchor || s.start_date || s.created; return a ? moisStripe(a, ENGAGEMENT_MOIS) : null; };
const ajouterMois = (ms, n) => { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
const dateFr = ms => ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'Pas de date';
async function abonnementsDuClient(db, clientId) {
  const { results: K } = await db.prepare("SELECT stripe_abo, pack, nb_creas, prix, cree_le FROM commandes WHERE client_id = ? AND stripe_abo IS NOT NULL AND formule = 'mensuel' AND statut != 'annule' ORDER BY cree_le").bind(clientId).all();
  if (!K.length) return [];
  const { results: E } = await db.prepare('SELECT * FROM abonnements WHERE client_id = ?').bind(clientId).all();
  const par = {};
  for (const k of K) (par[k.stripe_abo] = par[k.stripe_abo] || []).push(k);
  return Object.entries(par).map(([id, L]) => {
    const e = E.find(x => x.stripe_abo === id) || {}, der = L[L.length - 1], statut = e.statut || 'actif';
    return { id, pack: der.pack, nom: (PACKS[der.pack] || PACKS.custom).nom, nb_creas: der.nb_creas, prix: der.prix, debut: L[0].cree_le,
      mois_payes: L.length, engagement: ENGAGEMENT_MOIS, resiliable_des: ajouterMois(L[0].cree_le, ENGAGEMENT_MOIS - 1),
      resiliable: statut === 'actif' && L.length >= ENGAGEMENT_MOIS, statut, resilie_le: e.resilie_le || null, fin_le: e.fin_le || null, offre_le: e.offre_le || null };
  }).sort((a, b) => (a.statut === 'termine') - (b.statut === 'termine') || b.debut - a.debut);
}
// l'état d'un abonnement Stripe, rangé dans la base : actif, resiliation (s'arrête à fin_le), termine
async function majAbonnement(db, clientId, s, quand) {
  quand = quand || Math.floor(Date.now() / 1000);
  const fin = s.current_period_end || (s.items && s.items.data && s.items.data[0] && s.items.data[0].current_period_end) || null;
  const statut = s.status === 'canceled' ? 'termine' : (s.cancel_at_period_end || s.cancel_at) ? 'resiliation' : 'actif';
  const fin_le = statut === 'termine' ? ((s.ended_at || s.canceled_at || 0) * 1000 || maintenant()) : statut === 'resiliation' ? ((s.cancel_at || fin || 0) * 1000 || null) : null;
  const avant = await db.prepare('SELECT * FROM abonnements WHERE stripe_abo = ?').bind(s.id).first();
  // Stripe peut envoyer ses événements dans le désordre : un état plus ancien que celui déjà rangé est ignoré
  if (avant && avant.stripe_le && quand < avant.stripe_le) return { statut: avant.statut, fin_le: avant.fin_le, avant: avant.statut, perime: true };
  const resilie_le = statut === 'actif' ? null : (avant && avant.resilie_le) || ((s.canceled_at || 0) * 1000) || maintenant();
  await db.prepare(`INSERT INTO abonnements (stripe_abo, client_id, statut, resilie_le, fin_le, maj_le, stripe_le) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(stripe_abo) DO UPDATE SET statut = excluded.statut, resilie_le = excluded.resilie_le, fin_le = excluded.fin_le, maj_le = excluded.maj_le, stripe_le = excluded.stripe_le`)
    .bind(s.id, clientId, statut, resilie_le, fin_le, maintenant(), quand).run();
  return { statut, fin_le, avant: avant ? avant.statut : 'actif' };
}
// Stripe prévient quand un abonnement change (résilié depuis le tableau de bord Stripe, ou arrivé à son terme)
async function abonnementChange(env, s, quand) {
  if (!s.id) return;
  const db = await base(env);
  const k = await db.prepare('SELECT client_id FROM commandes WHERE stripe_abo = ? LIMIT 1').bind(s.id).first();
  if (!k) return;
  // l'engagement, appliqué dans Stripe : une résiliation programmée avant la fin du 3e mois est repoussée à cette date.
  // (Une annulation immédiate faite à la main dans Stripe reste possible : c'est un choix de Kreative.)
  const fin = s.cancel_at || (s.cancel_at_period_end ? (s.current_period_end || (s.items && s.items.data && s.items.data[0] && s.items.data[0].current_period_end)) : null);
  const mini = finMinimale(s);
  const avant = await db.prepare('SELECT stripe_le FROM abonnements WHERE stripe_abo = ?').bind(s.id).first();
  let repousse = false;
  const sansEngagement = await estClientWimmov(db, k.client_id);   // Wimmov : pas d'engagement, Kreative gère son abonnement
  if (!sansEngagement && s.status !== 'canceled' && fin && mini && fin < mini - 86400 && !(avant && avant.stripe_le && quand < avant.stripe_le) && env.STRIPE_SECRET) {
    try {
      const chemin = 'subscriptions/' + encodeURIComponent(s.id);
      if (s.cancel_at_period_end) await appelStripe(env, chemin, { cancel_at_period_end: 'false' });
      s = await appelStripe(env, chemin, { cancel_at: String(mini), proration_behavior: 'none', metadata: { engagement_mois: String(ENGAGEMENT_MOIS) } });
      quand = Math.floor(Date.now() / 1000); repousse = true;
      await noter(db, k.client_id, null, 'abonnement', 'Résiliation demandée pendant l\'engagement : repoussée au ' + dateFr(mini * 1000) + ' (fin du ' + ENGAGEMENT_MOIS + 'e mois)');
    } catch (err) {
      await noter(db, k.client_id, null, 'abonnement', 'Résiliation demandée pendant l\'engagement : à vérifier dans Stripe (' + String(err.message).slice(0, 120) + ')');
    }
  }
  const e = await majAbonnement(db, k.client_id, s, quand);
  if (repousse || e.perime || e.statut === e.avant) return;
  await noter(db, k.client_id, null, 'abonnement', e.statut === 'termine' ? 'Abonnement terminé le ' + dateFr(e.fin_le)
    : e.statut === 'resiliation' ? 'Abonnement résilié : il s\'arrête le ' + dateFr(e.fin_le) : 'Abonnement réactivé');
}
// les briefs des livraisons suivantes arrivés à leur date : notification + email, une seule fois chacun
async function rappelsDus(env, url, a) {
  const db = await base(env), now = a || maintenant();
  url = url || new URL(env.ORIGINE || 'https://app.kreativeads.fr');
  const { results } = await db.prepare('SELECT r.*, c.marque, c.contact, c.email, c.jeton, k.statut AS k_statut FROM rappels r JOIN clients c ON c.id = r.client_id LEFT JOIN commandes k ON k.id = r.commande_id WHERE r.envoye_le IS NULL AND r.le <= ? LIMIT 50').bind(now).all();
  let envoyes = 0;
  for (const r of results) {
    const ch = await db.prepare('UPDATE rappels SET envoye_le = ? WHERE cle = ? AND envoye_le IS NULL').bind(maintenant(), r.cle).run();
    if (!ch.meta || ch.meta.changes !== 1) continue;
    const fait = await (await baseLiv(env)).prepare('SELECT 1 AS ok FROM retours WHERE apres = ? LIMIT 1').bind(r.dossier).first();
    if (fait || ['annule', 'valide'].includes(r.k_statut)) continue;
    await notifier(env, r.client_id, { titre: 'Votre brief pour la livraison ' + r.n, texte: 'Faites-nous part de vos retours avant de lancer la prochaine livraison.', url: '/client/#/brief' });
    if (r.email && r.jeton) {
      const prenom = String(r.contact || '').trim().split(/\s+/)[0];
      await envoyerEmail(env, { type: 'brief_suivant', a: r.email, marque: r.marque, contact: r.contact || '', lien: lienAcces(url, r.jeton), sujet: r.marque + ' · Votre brief pour la livraison ' + r.n,
        html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
          paragraphes: ['Faites-nous part de vos retours pour lancer la prochaine livraison.',
            'Dites-nous-en davantage sur ce qui a fonctionné dans la livraison précédente, et sur ce que vous souhaitez garder ou changer pour la suivante.'],
          bouton: ['Remplir mon brief', lienAcces(url, r.jeton)] }) });
    }
    envoyes++;
  }
  return envoyes;
}
// un nouveau mois d'abonnement commence : la production attend son brief, le client est prévenu (notification + email)
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
async function prevenirBriefDuMois(env, url, clientId) {
  try {
    const db = await base(env);
    const cl = await db.prepare('SELECT marque, email, contact, jeton FROM clients WHERE id = ?').bind(clientId).first();
    if (!cl) return;
    const m = MOIS_FR[Number(new Date().toLocaleString('en-US', { month: 'numeric', timeZone: 'Europe/Paris' })) - 1];
    const deMois = (/^[ao]/.test(m) ? 'd\'' : 'de ') + m;
    await notifier(env, clientId, { titre: 'Votre brief ' + deMois, texte: 'Faites-nous part de vos retours pour lancer la production de ce nouveau mois.', url: '/client/#/brief' });
    if (cl.email && cl.jeton && url) {
      const prenom = String(cl.contact || '').trim().split(/\s+/)[0], lien = lienAcces(url, cl.jeton);
      await envoyerEmail(env, { type: 'brief_mois', a: cl.email, marque: cl.marque, contact: cl.contact || '', lien, sujet: cl.marque + ' · Votre brief ' + deMois,
        html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
          paragraphes: ['Votre nouveau mois d\'abonnement commence.', 'Dites-nous-en davantage sur ce qui a fonctionné le mois dernier, et sur ce que vous souhaitez garder ou changer ce mois-ci.'],
          bouton: ['Remplir mon brief', lien] }) });
    }
  } catch (e) {}
}
async function enregistrerFacture(env, inv, url) {
  if (!inv.id || inv.status === 'draft') return;
  const db = await base(env);
  const email = String(inv.customer_email || '').toLowerCase();
  const sd = inv.subscription_details || (inv.parent && inv.parent.subscription_details) || {};
  const abo = (typeof inv.subscription === 'string' && inv.subscription) || sd.subscription || null;
  const meta = Object.assign({}, sd.metadata, inv.metadata);
  let cl = meta.kreative_client ? await db.prepare('SELECT id FROM clients WHERE id = ?').bind(String(meta.kreative_client)).first() : null;
  if (!cl && inv.customer) cl = await db.prepare('SELECT id FROM clients WHERE stripe_client = ?').bind(String(inv.customer)).first();
  if (!cl && email) cl = await db.prepare('SELECT id FROM clients WHERE lower(email) = ?').bind(email).first();
  // « 1004 », « #1004 » ou l'ancien format « K-104 »
  const refMeta = String(meta.commande || '').trim().replace(/^#/, ''), ancien = refMeta.match(/^K-(\d+)$/i);
  let k = refMeta ? await db.prepare('SELECT id, client_id FROM commandes WHERE ref = ?').bind(ancien ? String(Number(ancien[1]) + 900) : refMeta).first() : null;
  if (!k) k = await db.prepare('SELECT id, client_id FROM commandes WHERE stripe_facture = ?').bind(inv.id).first();
  if (!k && abo) {
    const derniere = await db.prepare('SELECT * FROM commandes WHERE stripe_abo = ? ORDER BY cree_le DESC LIMIT 1').bind(abo).first();
    if (derniere && inv.billing_reason === 'subscription_cycle' && inv.status === 'paid') {
      // un nouveau mois d'abonnement : une nouvelle commande, avec son propre brief
      try {
        const r = await creerCommande(db, { client_id: derniere.client_id, pack: derniere.pack, formule: 'mensuel', nb: derniere.nb_creas,
          prix: (inv.total || 0) / 100, options: derniere.options ? derniere.options.split(',') : [], stripe_abo: abo, stripe_facture: inv.id, texte: 'Nouveau mois d\'abonnement' });
        k = { id: r.id, client_id: derniere.client_id };
        if (await estClientWimmov(db, derniere.client_id)) await preparerCommandeWimmov(db, r.id);   // Wimmov : pas de brief, directement en production
        else await prevenirBriefDuMois(env, url, derniere.client_id);
      } catch (e) { k = await db.prepare('SELECT id, client_id FROM commandes WHERE stripe_facture = ?').bind(inv.id).first(); }
    } else if (derniere && !derniere.stripe_facture) k = { id: derniere.id, client_id: derniere.client_id };
  }
  // le numéro de la facture Stripe devient LE numéro de la commande : le même partout (portail, factures, emails).
  // Stripe numérote dans l'ordre pour tout le compte (IEVKJLPP-0023, -0024…).
  if (k && inv.number && inv.status !== 'void') await numeroDeCommande(db, k.id, inv.id, inv.number);
  const statut = { paid: 'payee', open: 'ouverte', void: 'annulee', uncollectible: 'impayee' }[inv.status] || inv.status;
  const payee = inv.status_transitions && inv.status_transitions.paid_at ? inv.status_transitions.paid_at * 1000 : null;
  const avant = await db.prepare('SELECT id, statut FROM factures WHERE stripe_id = ?').bind(inv.id).first();
  await db.prepare(`INSERT INTO factures (id, client_id, commande_id, numero, montant, montant_ht, devise, statut, emise_le, payee_le, pdf, lien, email, source, stripe_id, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(stripe_id) DO UPDATE SET statut = excluded.statut, numero = COALESCE(excluded.numero, factures.numero), montant = excluded.montant,
      montant_ht = excluded.montant_ht, payee_le = COALESCE(excluded.payee_le, factures.payee_le), pdf = COALESCE(excluded.pdf, factures.pdf),
      lien = COALESCE(excluded.lien, factures.lien), client_id = COALESCE(factures.client_id, excluded.client_id), commande_id = COALESCE(factures.commande_id, excluded.commande_id)`)
    .bind('f_' + aleatoire(10), (k && k.client_id) || (cl && cl.id) || null, k ? k.id : null, inv.number || null, (inv.total || 0) / 100,
      inv.total_excluding_tax != null ? inv.total_excluding_tax / 100 : null, inv.currency || 'eur', statut, (inv.created || 0) * 1000 || maintenant(), payee,
      inv.invoice_pdf || null, inv.hosted_invoice_url || null, email || null, 'stripe', inv.id, maintenant()).run();
  const qui = (k && k.client_id) || (cl && cl.id);
  if (qui && statut === 'payee' && (!avant || avant.statut !== 'payee')) await noter(db, qui, k ? k.id : null, 'facture', 'Paiement reçu · facture ' + (inv.number || '') + ' disponible');
}

// ============================================================
//  WIMMOV : un client à part, avec un contrat qui n'existe que pour lui.
//  Rien ici ne s'applique aux autres clients : tout passe par estWimmov().
//  - Abonnement de 1 200 € par mois (lien Stripe « Pack ULTRA ») : 60 créatives,
//    livrées en 4 fois (15 par semaine). Pas d'engagement de 3 mois, pas de
//    bouton Résilier dans son espace : il passe par Kreative.
//  - Kreative (l'admin) fait et livre ses créatives elle-même, depuis
//    /admin/wimmov.html. Le stratégiste et la designer ne voient jamais
//    Wimmov : ses dossiers (WIMMOV_…) sont cachés de leur API, aucun
//    Telegram, aucun brief Fillout, aucune fiche.
//  - Son espace (client/wimmov.html) : les créatives livrées, « Vos retours
//    de la semaine » (fichiers, liens, texte), des créatives en plus à ses
//    anciens prix, les factures, et l'accès partagé avec son media buyer
//    (même espace « Wimmov », son email reçoit aussi les livraisons).
// ============================================================
const WIMMOV = {
  domaine: 'wimmov.com',
  lien: 'plink_1UJxUZBaFgfyJZxjJCQHpo2g',      // le lien Stripe de son abonnement (Pack ULTRA, 1 200 € par mois)
  contact: 'Hugo Raffaelli',   // c'est toujours Hugo qui paie : « Bonjour Hugo, » dans l'email
  creas_mois: 60, prix_mois: 1200, livraisons_mois: 4,
  // ses anciens prix, pour des créatives en plus (paiement en une fois)
  packs: [{ nb: 6, prix: 180, nom: 'Starter' }, { nb: 12, prix: 280, nom: 'Growth' }, { nb: 24, prix: 490, nom: 'Scale' }],
  au_dela: 20, min_libre: 25, max_libre: 200,   // au-delà du Scale : 20 € la créative
  max_pieces: 30
};
// Wimmov = une adresse @wimmov.com, ou l'espace créé par son lien Stripe même payé avec une autre adresse (special = 'wimmov')
const estWimmov = cl => !!cl && (cl.special === 'wimmov' || new RegExp('@' + WIMMOV.domaine.replace('.', '\\.') + '$', 'i').test(String(cl.email || '').trim()));
const DOSSIER_WIMMOV = /^WIMMOV_/;
const dossierWimmov = commandeId => 'WIMMOV_' + String(commandeId).replace(/^k_/, '');
function prixWimmov(nb) {
  nb = Math.round(Number(nb) || 0);
  const p = WIMMOV.packs.find(x => x.nb === nb);
  if (p) return { nb, total: p.prix, nom: 'Pack ' + p.nom };
  if (nb >= WIMMOV.min_libre && nb <= WIMMOV.max_libre) return { nb, total: nb * WIMMOV.au_dela, nom: 'Pack Custom' };
  return null;
}
// l'espace Wimmov (le plus ancien client à une adresse @wimmov.com) : tous les paiements y arrivent
async function clientWimmov(db) {
  return db.prepare("SELECT * FROM clients WHERE (special = 'wimmov' OR lower(email) LIKE ?) AND statut != 'bloque' ORDER BY CASE WHEN special = 'wimmov' THEN 0 ELSE 1 END, cree_le LIMIT 1").bind('%@' + WIMMOV.domaine).first();
}
async function estClientWimmov(db, clientId) {
  if (!clientId) return false;
  const c = await db.prepare('SELECT email, special FROM clients WHERE id = ?').bind(clientId).first();
  return estWimmov(c);
}
let WIMMOV_PRET = false;
async function baseWimmov(env) {
  const db = await baseLiv(env);
  if (!WIMMOV_PRET) {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS wimmov_retours (id TEXT PRIMARY KEY, client_id TEXT, auteur TEXT, texte TEXT, liens TEXT,
        cree_le INTEGER, envoye_le INTEGER)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS wimmov_pieces (id TEXT PRIMARY KEY, retour_id TEXT NOT NULL, nom TEXT, cle TEXT, type TEXT,
        taille INTEGER, cree_le INTEGER)`),
      db.prepare('CREATE INDEX IF NOT EXISTS i_wpiece_retour ON wimmov_pieces(retour_id)')]);
    WIMMOV_PRET = true;
  }
  return db;
}
// les adresses qui reçoivent aussi les emails de Wimmov (le media buyer…)
async function emailsWimmov(env) {
  const db = await baseLiv(env);
  const r = await db.prepare("SELECT valeur FROM reglages WHERE cle = 'wimmov'").first();
  let v = {}; try { v = r ? JSON.parse(r.valeur) : {}; } catch (e) { v = {}; }
  return Array.isArray(v.emails) ? v.emails.filter(emailValide) : [];
}
async function enregistrerEmailsWimmov(env, liste, cl) {
  const propres = [...new Set((Array.isArray(liste) ? liste : []).map(x => propre(x, 160).toLowerCase()).filter(emailValide))]
    .filter(x => !cl || x !== String(cl.email || '').toLowerCase()).slice(0, 8);
  const db = await baseLiv(env);
  await db.prepare("INSERT INTO reglages (cle, valeur) VALUES ('wimmov', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(JSON.stringify({ emails: propres })).run();
  return propres;
}
// une commande de Wimmov : pas de brief, directement en production, dans un dossier caché de l'équipe
async function preparerCommandeWimmov(db, commandeId) {
  await db.prepare("UPDATE commandes SET dossier = COALESCE(dossier, ?), statut = CASE WHEN statut = 'brief' THEN 'production' ELSE statut END, brief_le = COALESCE(brief_le, ?) WHERE id = ?")
    .bind(dossierWimmov(commandeId), maintenant(), commandeId).run();
}
// ---------- les emails de Wimmov (vouvoiement, sobres) ----------
function emailAccesWimmov(url, cl, a) {
  const prenom = a === String(cl.email || '').toLowerCase() ? String(cl.contact || '').trim().split(/\s+/)[0] : '';
  const lien = lienAcces(url, cl.jeton);
  return { type: 'acces', a, marque: cl.marque, contact: cl.contact || '', lien, sujet: cl.marque + ' · votre espace Kreative',
    html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
      paragraphes: ['Voici le lien de l\'espace <b>' + echapper(cl.marque) + '</b> chez Kreative.',
        'Vous y retrouvez les créatives livrées chaque semaine, vous y déposez vos retours de la semaine (fichiers, liens, explications) et vous pouvez commander des créatives en plus.'],
      bouton: ['Ouvrir l\'espace ' + cl.marque, lien], note: 'Ce lien ouvre l\'espace de toute l\'équipe ' + echapper(cl.marque) + ' : partagez-le seulement avec les personnes qui travaillent sur vos publicités.' }) };
}
async function envoyerAccesWimmov(env, url, cl, adresses) {
  const r = [];
  for (const a of adresses) r.push(await envoyerEmail(env, emailAccesWimmov(url, cl, a)));
  return { ok: r.length > 0 && r.every(x => x.ok), envoyes: r.filter(x => x.ok).length, message: (r.find(x => !x.ok) || {}).message };
}
// ---------- un paiement Stripe de Wimmov (abonnement ou créatives en plus) ----------
async function paiementWimmov(env, ctx, url, s) {
  const db = await base(env), meta = s.metadata || {};
  const email = String((s.customer_details && s.customer_details.email) || s.customer_email || '').toLowerCase();
  let cl = meta.kreative_client ? await db.prepare('SELECT * FROM clients WHERE id = ?').bind(String(meta.kreative_client)).first() : null;
  if (!(s.payment_link === WIMMOV.lien || meta.wimmov === '1' || estWimmov({ email }) || estWimmov(cl))) return false;
  if (!estWimmov(cl)) cl = await clientWimmov(db);
  let nouveau = false;
  if (!cl) {
    if (!emailValide(email)) return true;
    const det = s.customer_details || {}, info = s.collected_information || {};
    const id = 'c_' + aleatoire(10), jeton = aleatoire(32);
    const marque = propre(info.business_name || det.business_name || 'Wimmov', 80) || 'Wimmov';
    const contact = WIMMOV.contact;
    await db.prepare("INSERT INTO clients (id, marque, contact, email, jeton, cree_le, special) VALUES (?,?,?,?,?,?,'wimmov')")
      .bind(id, marque, contact, email, jeton, maintenant()).run();
    await noter(db, id, null, 'client', 'Espace Wimmov créé');
    cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
    nouveau = true;
  }
  if (s.customer && !cl.stripe_client) await db.prepare('UPDATE clients SET stripe_client = ? WHERE id = ?').bind(String(s.customer), cl.id).run();
  const mensuel = s.mode === 'subscription', total = (s.amount_total || 0) / 100;
  const nb = mensuel ? WIMMOV.creas_mois : (Number(meta.nb_creas) || (WIMMOV.packs.find(x => x.prix === total) || {}).nb || Math.round(total / WIMMOV.au_dela));
  const r = await creerCommande(db, { client_id: cl.id, pack: 'custom', formule: mensuel ? 'mensuel' : 'unique', nb: nb || 0, prix: total, options: [],
    stripe_session: s.id, stripe_abo: typeof s.subscription === 'string' ? s.subscription : null, stripe_facture: typeof s.invoice === 'string' ? s.invoice : null,
    texte: mensuel ? 'Paiement reçu, abonnement Wimmov' : 'Paiement reçu, créatives en plus' });
  await preparerCommandeWimmov(db, r.id);
  if (typeof s.invoice === 'string') {
    await db.prepare('UPDATE factures SET commande_id = COALESCE(commande_id, ?), client_id = COALESCE(client_id, ?) WHERE stripe_id = ?').bind(r.id, cl.id, s.invoice).run();
    const f = await db.prepare('SELECT numero FROM factures WHERE stripe_id = ?').bind(s.invoice).first();
    if (f && f.numero) await numeroDeCommande(db, r.id, s.invoice, f.numero);
  }
  if (nouveau) {
    const envoi = envoyerAccesWimmov(env, url, cl, [cl.email].concat(await emailsWimmov(env)));
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
  }
  return true;
}
// ---------- l'état d'une livraison Wimmov : « Livraison 2 » (le numéro vient du dossier _L2) ----------
const numeroLivraison = d => Number((String(d).match(/_L(\d+)$/) || [])[1]) || 1;
async function commandesWimmov(env, db, clientId, pourClient) {
  const { results: K } = await db.prepare("SELECT * FROM commandes WHERE client_id = ? AND statut != 'annule' ORDER BY cree_le DESC").bind(clientId).all();
  const dossiers = K.map(k => k.dossier).filter(Boolean);
  let L = [];
  if (dossiers.length) {
    L = (await db.prepare('SELECT l.*, (SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id) AS nb, ' +
      "(SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id AND f.format = '1x1') AS nb_1x1 FROM livraisons l WHERE " +
      dossiers.map(() => 'l.dossier LIKE ?').join(' OR ') + ' ORDER BY l.dossier, l.version DESC').bind(...dossiers.map(d => d + '_L%')).all()).results;
  }
  return K.map(k => {
    const d = k.dossier || '', mes = L.filter(l => baseDossier(l.dossier) === d && (!pourClient || VISIBLES_CLIENT.includes(l.statut)));
    // une ligne par livraison (la dernière version visible)
    const par = {};
    for (const l of mes) if (!par[l.dossier]) par[l.dossier] = l;
    const livraisons = Object.values(par).map(l => ({ id: l.id, dossier: l.dossier, n: numeroLivraison(l.dossier), version: l.version, statut: l.statut,
      envoye_le: l.envoye_le, cree_le: l.cree_le, fichiers: l.nb, creatives: l.nb_1x1 || Math.round((l.nb || 0) / 3) })).sort((a, b) => a.n - b.n);
    return { id: k.id, ref: k.ref, formule: k.formule, nb_creas: k.nb_creas, prix: k.prix, statut: k.statut, cree_le: k.cree_le, dossier: k.dossier,
      livraisons, livrees: livraisons.filter(l => VISIBLES_CLIENT.includes(l.statut)).reduce((s, l) => s + l.creatives, 0) };
  });
}
async function retoursWimmov(env, clientId, tous) {
  const db = await baseWimmov(env);
  const { results: R } = await db.prepare('SELECT * FROM wimmov_retours WHERE client_id = ? AND envoye_le IS NOT NULL ORDER BY envoye_le DESC LIMIT ' + (tous ? 200 : 60)).bind(clientId).all();
  if (!R.length) return [];
  const { results: P } = await db.prepare('SELECT id, retour_id, nom, type, taille FROM wimmov_pieces WHERE retour_id IN (' + R.map(() => '?').join(',') + ') ORDER BY cree_le').bind(...R.map(r => r.id)).all();
  return R.map(r => { let liens = []; try { liens = JSON.parse(r.liens || '[]'); } catch (e) {}
    return { id: r.id, auteur: r.auteur, texte: r.texte, liens, envoye_le: r.envoye_le, pieces: P.filter(p => p.retour_id === r.id).map(p => ({ id: p.id, nom: p.nom, type: p.type, taille: p.taille, url: '/api/wimmov/pieces/' + p.id })) }; });
}
const lienPropre = x => { const t = propre(x, 600); try { const u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : null; } catch (e) { return null; } };
// ---------- l'API de l'espace Wimmov (le client, ou l'admin en aperçu) ----------
async function apiWimmovClient(req, env, ctx, url, chemin, methode, cl, apercu) {
  if (!estWimmov(cl)) return json({ erreur: 'Introuvable' }, 404);
  const db = await baseWimmov(env);
  let m;
  if (chemin === '' && methode === 'GET') {
    const [commandes, retours, { results: factures }, abonnements, emails] = await Promise.all([
      commandesWimmov(env, db, cl.id, true), retoursWimmov(env, cl.id),
      db.prepare("SELECT * FROM factures WHERE client_id = ? AND statut != 'brouillon' ORDER BY emise_le DESC").bind(cl.id).all(),
      abonnementsDuClient(db, cl.id), emailsWimmov(env)]);
    if (!apercu) ctx.waitUntil(db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(maintenant(), cl.id).run());
    return json({ apercu, client: { id: cl.id, marque: cl.marque, contact: cl.contact, email: cl.email, photo_le: cl.photo ? cl.photo_le || 1 : null },
      lien: lienAcces(url, cl.jeton), emails, commandes, retours, factures: factures.map(FACTURE_PUBLIQUE),
      abonnements: abonnements.map(a => ({ id: a.id, statut: a.statut, debut: a.debut, mois_payes: a.mois_payes, fin_le: a.fin_le })),
      contrat: { creas_mois: WIMMOV.creas_mois, prix_mois: WIMMOV.prix_mois, livraisons_mois: WIMMOV.livraisons_mois },
      tarifs: { packs: WIMMOV.packs, au_dela: WIMMOV.au_dela, min_libre: WIMMOV.min_libre, max_libre: WIMMOV.max_libre }, paiement: !!env.STRIPE_SECRET });
  }
  if (methode !== 'GET' && apercu) return json({ erreur: 'Aperçu : rien n\'est enregistré à la place du client.' }, 403);
  // les retours de la semaine : un brouillon (pour y joindre des fichiers), puis l'envoi
  if (chemin === '/retours' && methode === 'POST') {
    const deja = await db.prepare('SELECT id FROM wimmov_retours WHERE client_id = ? AND envoye_le IS NULL ORDER BY cree_le DESC LIMIT 1').bind(cl.id).first();
    if (deja) return json({ id: deja.id });
    const id = 'wr_' + aleatoire(12);
    await db.prepare('INSERT INTO wimmov_retours (id, client_id, cree_le) VALUES (?,?,?)').bind(id, cl.id, maintenant()).run();
    return json({ id });
  }
  if (chemin === '/pieces' && methode === 'PUT') {
    if (!env.FICHIERS) return json({ erreur: 'Le stockage des fichiers n\'est pas branché.' }, 503);
    const r = await db.prepare('SELECT * FROM wimmov_retours WHERE id = ? AND client_id = ?').bind(url.searchParams.get('retour') || '', cl.id).first();
    if (!r || r.envoye_le) return json({ erreur: 'Ces retours sont déjà envoyés.' }, 409);
    const n = await db.prepare('SELECT COUNT(*) AS n FROM wimmov_pieces WHERE retour_id = ?').bind(r.id).first();
    if (n && n.n >= WIMMOV.max_pieces) return json({ erreur: WIMMOV.max_pieces + ' fichiers au maximum par envoi.' }, 413);
    const taille = Number(req.headers.get('Content-Length') || 0);
    if (taille > 95e6) return json({ erreur: 'Fichier trop lourd (95 Mo au maximum).' }, 413);
    const nom = propre(url.searchParams.get('nom'), 140).replace(/[^\p{L}\p{N}._ ()-]/gu, '_') || 'fichier';
    const type = propre((req.headers.get('Content-Type') || 'application/octet-stream').split(';')[0], 100);
    const id = 'wp_' + aleatoire(12), cle = 'wimmov/retours/' + r.id + '/' + id + '-' + nom.replace(/\s+/g, '_');
    await env.FICHIERS.put(cle, req.body, { httpMetadata: { contentType: type } });
    await db.prepare('INSERT INTO wimmov_pieces (id, retour_id, nom, cle, type, taille, cree_le) VALUES (?,?,?,?,?,?,?)').bind(id, r.id, nom, cle, type, taille, maintenant()).run();
    return json({ ok: true, id, nom });
  }
  if ((m = chemin.match(/^\/pieces\/(wp_[A-Za-z0-9]+)$/)) && methode === 'DELETE') {
    const p = await db.prepare('SELECT p.*, r.envoye_le, r.client_id FROM wimmov_pieces p JOIN wimmov_retours r ON r.id = p.retour_id WHERE p.id = ?').bind(m[1]).first();
    if (!p || p.client_id !== cl.id || p.envoye_le) return json({ erreur: 'Ce fichier ne peut plus être retiré.' }, 409);
    if (env.FICHIERS) { try { await env.FICHIERS.delete(p.cle); } catch (e) {} }
    await db.prepare('DELETE FROM wimmov_pieces WHERE id = ?').bind(p.id).run();
    return json({ ok: true });
  }
  if ((m = chemin.match(/^\/retours\/(wr_[A-Za-z0-9]+)\/envoyer$/)) && methode === 'POST') {
    const b = await corpsJson(req);
    const r = await db.prepare('SELECT * FROM wimmov_retours WHERE id = ? AND client_id = ?').bind(m[1], cl.id).first();
    if (!r || r.envoye_le) return json({ erreur: 'Ces retours sont déjà envoyés.' }, 409);
    const texte = propre(b.texte, 8000), auteur = propre(b.auteur, 80);
    const liens = [...new Set((Array.isArray(b.liens) ? b.liens : []).map(lienPropre).filter(Boolean))].slice(0, 20);
    const P = (await db.prepare('SELECT nom FROM wimmov_pieces WHERE retour_id = ?').bind(r.id).all()).results;
    if (!texte && !liens.length && !P.length) return json({ erreur: 'Écrivez vos retours, ajoutez un lien ou un fichier.' }, 400);
    const ch = await db.prepare('UPDATE wimmov_retours SET texte = ?, liens = ?, auteur = ?, envoye_le = ? WHERE id = ? AND envoye_le IS NULL')
      .bind(texte || null, JSON.stringify(liens), auteur || null, maintenant(), r.id).run();
    if (!ch.meta || ch.meta.changes !== 1) return json({ erreur: 'Ces retours sont déjà envoyés.' }, 409);
    await noter(db, cl.id, null, 'brief', 'Retours de la semaine envoyés' + (auteur ? ' par ' + auteur : ''));
    // Kreative est prévenu par email (le texte, les liens, les fichiers sont dans l'admin)
    const admin = url.origin + '/admin/#/wimmov/retours';
    const envoi = envoyerEmail(env, { type: 'wimmov_retours', a: env.EMAIL_KREATIVE || 'contact@kreativeads.fr', marque: cl.marque, contact: 'Kreative', lien: admin,
      sujet: cl.marque + ' · retours de la semaine',
      html: emailHtml(url.origin, { titre: cl.marque + ' a envoyé ses retours de la semaine', paragraphes: [
        (auteur ? 'De ' + echapper(auteur) + '. ' : '') + (P.length ? P.length + ' fichier' + (P.length > 1 ? 's' : '') + ' joint' + (P.length > 1 ? 's' : '') + '. ' : '') + (liens.length ? liens.length + ' lien' + (liens.length > 1 ? 's' : '') + '.' : '')]
        .concat(texte ? ['« ' + echapper(texte).replace(/\n/g, '<br>') + ' »'] : [])
        .concat(liens.map(l => '<a href="' + echapper(l) + '" style="color:#4d94ff">' + echapper(l) + '</a>')),
        bouton: ['Voir dans l\'admin', admin] }) });
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
    return json({ ok: true });
  }
  // l'accès partagé : les adresses qui reçoivent aussi les emails (le media buyer)
  if (chemin === '/acces' && methode === 'PATCH') {
    const b = await corpsJson(req), avant = await emailsWimmov(env);
    const emails = await enregistrerEmailsWimmov(env, b.emails, cl);
    const nouveaux = emails.filter(x => !avant.includes(x));
    if (nouveaux.length) await noter(db, cl.id, null, 'lien', 'Accès partagé avec ' + nouveaux.join(', '));
    // la nouvelle adresse reçoit tout de suite le lien de l'espace
    if (nouveaux.length && b.envoyer !== false) { const envoi = envoyerAccesWimmov(env, url, cl, nouveaux); if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi; }
    return json({ ok: true, emails });
  }
  // des créatives en plus, à ses anciens prix (paiement en une fois)
  if (chemin === '/paiement' && methode === 'POST') {
    if (!env.STRIPE_SECRET) return json({ erreur: 'Le paiement en ligne n\'est pas encore branché. Écrivez-nous sur WhatsApp.' }, 503);
    const b = await corpsJson(req), d = prixWimmov(b.nb_creas);
    if (!d) return json({ erreur: 'Choisissez 6, 12, 24 créatives, ou entre ' + WIMMOV.min_libre + ' et ' + WIMMOV.max_libre + '.' }, 400);
    const meta = { wimmov: '1', kreative_client: cl.id, pack: 'custom', formule: 'unique', nb_creas: String(d.nb), total: String(d.total) };
    const description = d.nb + ' créatives • Livrées en 1:1, 4:5 et 9:16';
    const p = { mode: 'payment', locale: 'fr', metadata: meta, client_reference_id: cl.id,
      success_url: url.origin + '/client/#/merci', cancel_url: url.origin + '/client/#/commander',
      allow_promotion_codes: 'true', billing_address_collection: 'required', tax_id_collection: { enabled: 'true' },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: String(Math.round(d.total * 100)), product_data: { name: d.nom, description } } }],
      invoice_creation: { enabled: 'true', invoice_data: { metadata: meta, description } }, payment_intent_data: { metadata: meta } };
    if (cl.stripe_client) { p.customer = cl.stripe_client; p.customer_update = { name: 'auto', address: 'auto' }; }
    else { p.customer_email = cl.email; p.customer_creation = 'always'; }
    try {
      const s = await appelStripe(env, 'checkout/sessions', p);
      if (!b.prepare) await noter(db, cl.id, null, 'paiement', 'Paiement ouvert · ' + d.nb + ' créatives · ' + d.total + ' €');
      return json({ url: s.url, total: d.total });
    } catch (e) { return json({ erreur: 'Stripe : ' + e.message }, 502); }
  }
  return json({ erreur: 'Introuvable' }, 404);
}
// un fichier joint aux retours de Wimmov : Wimmov ou l'admin seulement
async function servirPieceWimmov(req, env, url, id) {
  const db = await baseWimmov(env);
  const p = await db.prepare('SELECT p.*, r.client_id FROM wimmov_pieces p JOIN wimmov_retours r ON r.id = p.retour_id WHERE p.id = ?').bind(id).first();
  if (!p) return texte('Introuvable', 404);
  const equipe = await session(req, env);
  if (!(equipe && equipe.role === 'admin')) {
    const cl = await sessionClient(req, env);
    if (!cl || cl.id !== p.client_id) return texte('Accès refusé', 403);
  }
  if (!env.FICHIERS) return texte('Stockage absent', 503);
  const o = await env.FICHIERS.get(p.cle);
  if (!o) return texte('Introuvable', 404);
  return new Response(o.body, { headers: { 'Content-Type': p.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': (url.searchParams.has('dl') ? 'attachment' : 'inline') + '; filename="' + String(p.nom).replace(/["\\\r\n]/g, '_') + '"' } });
}
// ---------- l'admin : la page Wimmov (/admin/wimmov.html) ----------
async function apiWimmovAdmin(env, ctx, url, chemin, methode, b) {
  const db = await baseWimmov(env);
  const cl = await clientWimmov(db);
  let m;
  if (chemin === '' && methode === 'GET') {
    if (!cl) return json({ client: null, emails: await emailsWimmov(env), contrat: WIMMOV });
    const [commandes, retours, { results: factures }, abonnements, emails] = await Promise.all([
      commandesWimmov(env, db, cl.id, false), retoursWimmov(env, cl.id, true),
      db.prepare('SELECT * FROM factures WHERE client_id = ? ORDER BY emise_le DESC').bind(cl.id).all(), abonnementsDuClient(db, cl.id), emailsWimmov(env)]);
    const { photo, ...client } = cl;
    return json({ client: { ...client, lien: lienAcces(url, cl.jeton) }, emails, commandes, retours, factures, abonnements, contrat: WIMMOV, stockage: !!env.FICHIERS });
  }
  if (!cl) return json({ erreur: 'Créez d\'abord le client Wimmov (Clients, puis Nouveau client, avec son adresse @' + WIMMOV.domaine + ').' }, 409);
  // un mois d'abonnement ou des créatives en plus, ajoutés à la main (payés hors du portail)
  if (chemin === '/commandes' && methode === 'POST') {
    const mois = b.type !== 'extra';
    const nb = mois ? WIMMOV.creas_mois : Math.round(Number(b.nb_creas) || 0);
    if (!nb || nb < 1 || nb > 500) return json({ erreur: 'Nombre de créatives invalide.' }, 400);
    const prix = b.prix === '' || b.prix == null ? (mois ? WIMMOV.prix_mois : (prixWimmov(nb) || { total: nb * WIMMOV.au_dela }).total) : Number(b.prix);
    if (!Number.isFinite(prix) || prix < 0) return json({ erreur: 'Prix invalide.' }, 400);
    const r = await creerCommande(db, { client_id: cl.id, pack: 'custom', formule: mois ? 'mensuel' : 'unique', nb, prix, options: [], texte: mois ? 'Nouveau mois Wimmov' : 'Créatives en plus' });
    await preparerCommandeWimmov(db, r.id);
    return json({ ok: true, id: r.id, ref: r.ref });
  }
  // une nouvelle livraison (la suivante de la commande), ou une nouvelle version d'une livraison
  if (chemin === '/livraisons' && methode === 'POST') {
    let dossier;
    if (b.dossier) {
      dossier = propre(b.dossier, 80);
      if (!DOSSIER_WIMMOV.test(dossier) || !/^[A-Za-z0-9_-]{3,80}$/.test(dossier)) return json({ erreur: 'Livraison inconnue.' }, 400);
    } else {
      const k = await db.prepare('SELECT * FROM commandes WHERE id = ? AND client_id = ?').bind(propre(b.commande_id, 40), cl.id).first();
      if (!k) return json({ erreur: 'Commande introuvable.' }, 404);
      if (!k.dossier) await preparerCommandeWimmov(db, k.id);
      const base = k.dossier || dossierWimmov(k.id);
      const { results: D } = await db.prepare('SELECT DISTINCT dossier FROM livraisons WHERE dossier LIKE ?').bind(base + '_L%').all();
      const n = D.reduce((x, d) => Math.max(x, numeroLivraison(d.dossier)), 0);
      // un brouillon déjà commencé : on le reprend
      const brouillon = n ? await db.prepare("SELECT * FROM livraisons WHERE dossier = ? AND statut = 'brouillon'").bind(base + '_L' + n).first() : null;
      dossier = brouillon ? brouillon.dossier : base + '_L' + (n + 1);
    }
    const der = await db.prepare('SELECT * FROM livraisons WHERE dossier = ? ORDER BY version DESC LIMIT 1').bind(dossier).first();
    if (der && der.statut === 'brouillon') return json(await detailLivraison(db, der, false));
    const id = 'l_' + aleatoire(10), now = maintenant();
    await db.prepare('INSERT INTO livraisons (id, dossier, version, statut, cree_le) VALUES (?,?,?,?,?)').bind(id, dossier, der ? der.version + 1 : 1, 'brouillon', now).run();
    if (der) {
      // la nouvelle version reprend les fichiers de la précédente : on ne remplace que ce qui change
      const { results: F } = await db.prepare('SELECT * FROM fichiers WHERE livraison_id = ?').bind(der.id).all();
      if (F.length) await db.batch(F.map(f => db.prepare('INSERT INTO fichiers (id, livraison_id, format, nom, cle, mini, type, taille, largeur, hauteur, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind('fi_' + aleatoire(12), id, f.format, f.nom, f.cle, f.mini, f.type, f.taille, f.largeur, f.hauteur, now)));
    }
    return json(await detailLivraison(db, await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(id).first(), false));
  }
  if ((m = chemin.match(/^\/livraisons\/([A-Za-z0-9_-]{3,80})$/)) && methode === 'GET') {
    if (!DOSSIER_WIMMOV.test(m[1])) return json({ erreur: 'Introuvable' }, 404);
    const { results } = await db.prepare('SELECT * FROM livraisons WHERE dossier = ? ORDER BY version DESC').bind(m[1]).all();
    return json({ dossier: m[1], versions: await Promise.all(results.map(l => detailLivraison(db, l, false))) });
  }
  // envoyer une livraison à Wimmov : visible tout de suite dans son espace, email à Hugo et au media buyer
  if ((m = chemin.match(/^\/livraisons\/(l_[A-Za-z0-9_]+)\/envoyer$/)) && methode === 'POST') {
    const l = await db.prepare('SELECT * FROM livraisons WHERE id = ?').bind(m[1]).first();
    if (!l || !DOSSIER_WIMMOV.test(l.dossier)) return json({ erreur: 'Livraison inconnue.' }, 404);
    if (l.statut !== 'brouillon') return json({ erreur: 'Cette livraison est déjà envoyée.' }, 409);
    const nf = await db.prepare('SELECT COUNT(*) AS n FROM fichiers WHERE livraison_id = ?').bind(l.id).first();
    if (!nf || !nf.n) return json({ erreur: 'Ajoutez d\'abord les fichiers.' }, 400);
    const now = maintenant();
    const ch = await db.prepare("UPDATE livraisons SET statut = 'envoyee', depose_le = ?, verifie_le = ?, envoye_le = ? WHERE id = ? AND statut = 'brouillon'").bind(now, now, now, l.id).run();
    if (!ch.meta || ch.meta.changes !== 1) return json({ erreur: 'Cette livraison est déjà envoyée.' }, 409);
    const k = await commandeDuDossier(db, l.dossier);
    const n = numeroLivraison(l.dossier), v2 = l.version > 1;
    if (k) {
      // un mois (60 créas) n'est livré qu'à sa 4e livraison ; des créas en plus, dès la 1re
      const faites = await db.prepare("SELECT COUNT(DISTINCT dossier) AS n FROM livraisons WHERE statut = 'envoyee' AND (dossier = ? OR dossier LIKE ?)").bind(k.dossier, k.dossier + '_L%').first().catch(() => null);
      const fini = k.formule !== 'mensuel' || (faites && faites.n >= WIMMOV.livraisons_mois);
      if (fini && !['valide', 'annule'].includes(k.statut)) await db.prepare("UPDATE commandes SET statut = 'livre', livre_le = COALESCE(livre_le, ?) WHERE id = ?").bind(now, k.id).run();
      await noter(db, k.client_id, k.id, 'livre', v2 ? 'Livraison ' + n + ' : nouvelle version' : 'Livraison ' + n + ' disponible');
    }
    const titre = v2 ? 'Livraison ' + n + ' : nouvelle version' : 'Livraison ' + n + ' disponible';
    const notif = notifier(env, cl.id, { titre, texte: 'Vos nouvelles créatives sont disponibles dans votre espace.', url: '/client/#/creatives' });
    if (ctx && ctx.waitUntil) ctx.waitUntil(notif); else await notif;
    const lien = lienAcces(url, cl.jeton), a = [cl.email].concat(await emailsWimmov(env)).filter(Boolean);
    const envoi = (async () => { for (const x of a) await envoyerEmail(env, { type: 'creatives', a: x, marque: cl.marque, contact: cl.contact || '', lien, sujet: cl.marque + ' · ' + titre,
      html: emailHtml(url.origin, { titre: 'Bonjour' + (x === String(cl.email).toLowerCase() && cl.contact ? ' ' + String(cl.contact).trim().split(/\s+/)[0] : '') + ',',
        paragraphes: [v2 ? 'La nouvelle version de la livraison ' + n + ' est disponible dans votre espace.' : 'Les créatives de la livraison ' + n + ' sont disponibles dans votre espace.',
          'Vos retours de la semaine se déposent au même endroit.'],
        bouton: ['Voir les créatives', lien] }) }); })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
    return json({ ok: true, message: 'Livraison ' + n + ' envoyée à ' + cl.marque + '.' });
  }
  // les adresses qui reçoivent aussi les emails, et l'envoi du lien de l'espace
  if (chemin === '/acces' && methode === 'PATCH') return json({ ok: true, emails: await enregistrerEmailsWimmov(env, b.emails, cl) });
  if (chemin === '/lien' && methode === 'POST') {
    const tous = [cl.email].concat(await emailsWimmov(env)).filter(Boolean);
    const a = b.a ? tous.filter(x => x === String(b.a).toLowerCase()) : tous;
    if (!a.length) return json({ erreur: 'Adresse inconnue.' }, 400);
    const r = await envoyerAccesWimmov(env, url, cl, a);
    if (r.ok) await noter(db, cl.id, null, 'lien', 'Lien de l\'espace envoyé à ' + a.join(', '));
    return json({ ...r, message: r.ok ? 'Lien envoyé à ' + a.join(', ') + '.' : r.message }, r.ok ? 200 : 502);
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ============================================================
//  STUDIO (studio.kreativeads.fr) : l'Instagram de Kreative, pour Dario seulement (rôle admin)
//    - programmer des reels (normal ou d'essai) : la vidéo est gardée dans R2, publiée à l'heure par le Cron
//    - les statistiques de tous ses reels (vues, abonnés gagnés, likes, partages…) et le classement des formats
//  API officielle « Instagram API with Instagram Login » (graph.instagram.com). Le token est collé une fois
//  dans le Studio (Réglages), gardé dans D1, jamais renvoyé à la page, rafraîchi tout seul avant ses 60 jours.
//  Rien ici ne touche aux clients, à l'équipe ni au reste du portail.
// ============================================================
const STUDIO = { version: 'v23.0', max_octets: 95e6, sync_toutes: 55 * 60e3, rafraichir_apres: 20 * 864e5,
  // métriques demandées pour chaque reel ; celles qu'Instagram refuse sont retenues et plus redemandées
  metriques: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'follows', 'profile_visits'],
  stats_par_passe: 30, appels_par_passe: 40 };
// l'app « Kreative Studio » : K blanc sur fond noir (arrondi sur ordinateur, plein sur téléphone)
const MANIFESTE_STUDIO = { name: 'Kreative Studio', short_name: 'Studio', description: 'Programmer et suivre les reels Instagram de Kreative', id: '/', start_url: '/', scope: '/',
  display: 'standalone', background_color: '#f8f6f3', theme_color: '#ffffff', lang: 'fr',
  icons: [{ src: '/app-icon-studio-bureau-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/app-icon-studio-bureau-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/app-icon-studio-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
const estStudio = (url, env) => /^studio\./.test(url.hostname) || (!!env.STUDIO_HOTE && url.hostname === env.STUDIO_HOTE);
const apiIG = env => (env.INSTAGRAM_API || 'https://graph.instagram.com').replace(/\/$/, '');
let STUDIO_PRET = false;
async function baseStudio(env) {
  const db = await baseLiv(env);
  if (!STUDIO_PRET) {
    await db.batch([
      // les vidéos déposées dans le Studio (à programmer, programmées, publiées)
      db.prepare(`CREATE TABLE IF NOT EXISTS studio_videos (id TEXT PRIMARY KEY, statut TEXT, nom TEXT, cle TEXT, jeton TEXT, type TEXT, taille INTEGER,
        legende TEXT, format TEXT, essai INTEGER DEFAULT 0, essai_auto INTEGER DEFAULT 0, partage_fil INTEGER DEFAULT 1, publier_le INTEGER,
        origine TEXT, conteneur TEXT, conteneur_le INTEGER, media_id TEXT, permalink TEXT, erreur TEXT, publie_le INTEGER, cree_le INTEGER)`),
      // tous ses reels Instagram (publiés par le Studio ou depuis l'app) et leurs dernières statistiques
      db.prepare(`CREATE TABLE IF NOT EXISTS studio_medias (media_id TEXT PRIMARY KEY, legende TEXT, type TEXT, permalink TEXT, miniature TEXT,
        publie_le INTEGER, format TEXT, essai INTEGER, video_id TEXT, stats TEXT, stats_le INTEGER, vu_le INTEGER)`),
      // abonnés : le total relevé chaque jour, et les nouveaux abonnés du jour donnés par Instagram
      db.prepare('CREATE TABLE IF NOT EXISTS studio_jours (jour TEXT PRIMARY KEY, abonnes INTEGER, gagnes INTEGER)'),
      db.prepare('CREATE INDEX IF NOT EXISTS i_studio_v_statut ON studio_videos(statut, publier_le)')]);
    // masque : 1 = retiré du Studio par Dario, 2 = n'est plus sur Instagram (archivé ou supprimé dans l'app)
    try { await db.prepare('ALTER TABLE studio_medias ADD COLUMN masque INTEGER DEFAULT 0').run(); } catch (e) {}
    STUDIO_PRET = true;
  }
  return db;
}
async function reglageStudio(db) {
  const r = await db.prepare("SELECT valeur FROM reglages WHERE cle = 'studio'").first();
  try { return r ? JSON.parse(r.valeur) : {}; } catch (e) { return {}; }
}
async function enregistrerStudio(db, maj) {
  const v = Object.assign(await reglageStudio(db), maj);
  await db.prepare("INSERT INTO reglages (cle, valeur) VALUES ('studio', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(JSON.stringify(v)).run();
  return v;
}
// un appel à Instagram : GET (paramètres dans l'adresse) ou POST (formulaire) ; renvoie le JSON ou lance l'erreur d'Instagram
async function appelIG(env, chemin, params, methode, sansVersion) {
  const u = apiIG(env) + (sansVersion ? '' : '/' + STUDIO.version) + chemin, corps = new URLSearchParams(params || {});
  const r = methode === 'POST' ? await fetch(u, { method: 'POST', body: corps, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    : await fetch(u + '?' + corps.toString());
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (!r.ok || d.error) { const e = new Error((d.error && d.error.message) || ('Instagram a répondu ' + r.status)); e.code = d.error && d.error.code; throw e; }
  return d;
}
// Meta bloque tout le compte (accès bloqué, compte développeur à vérifier, permission retirée, trop d'appels) :
// rien à voir avec la vidéo, donc elle reste programmée et part dès que c'est rétabli
const bloqueIG = e => !!e && (e.code === 190 || e.code === 200 || [4, 10, 17, 32, 613].includes(e.code) || /access blocked|temporarily blocked|request limit|too many calls/i.test(String(e.message || '')));
const messageIG = e => {
  const m = String(e && e.message || e);
  if (e && e.code === 190) return 'La connexion Instagram a expiré : recollez un token dans Réglages.';
  if (/access blocked/i.test(m)) return 'Meta bloque l\'accès de l\'app Kreative Studio (API access blocked). Connectez-vous sur developers.facebook.com et faites ce que Meta demande (vérification du compte). Les reels programmés restent programmés et partiront dès que c\'est rétabli.';
  if (e && [4, 17, 32, 613].includes(e.code)) return 'Instagram limite les envois pour le moment. Nouvel essai automatique dans quelques minutes.';
  if (e && e.code === 200) return 'Instagram refuse l\'accès (' + m.slice(0, 120) + '). Vérifiez l\'app Meta et ses permissions. Les reels programmés partiront dès que c\'est rétabli.';
  if (/format|codec|resolution|aspect|duration/i.test(m)) return 'Instagram refuse cette vidéo (format, durée ou taille). Exportez-la en MP4 (H.264), 9:16, 3 s à 15 min.';
  return 'Instagram : ' + m.slice(0, 220);
};

// ---------- le routeur : la page (studio.kreativeads.fr ou /studio/), l'API, et la vidéo publique pour Instagram ----------
async function routerStudio(req, env, ctx, url, chemin) {
  let m;
  // Instagram vient chercher la vidéo à cette adresse (publique, introuvable sans son jeton)
  if ((m = chemin.match(/^\/_studio\/video\/(sv_[A-Za-z0-9]+)-([A-Za-z0-9]{24})\.mp4$/)) && (req.method === 'GET' || req.method === 'HEAD')) return servirVideoStudio(req, env, m[1], m[2]);
  const surStudio = estStudio(url, env);
  // l'app du Studio (à installer sur l'ordinateur ou le téléphone) : manifeste et service worker, publics
  if (surStudio && chemin === '/manifest.webmanifest') return new Response(JSON.stringify(MANIFESTE_STUDIO), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' } });
  if (surStudio && chemin === '/sw.js') return new Response(SERVICE_WORKER_ADMIN, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' } });
  if (!chemin.startsWith('/api/studio') && !(surStudio && (chemin === '/' || chemin === '/index.html'))) return null;
  const qui = await session(req, env);
  if (!qui) return chemin.startsWith('/api/') ? json({ erreur: 'Connexion requise' }, 401) : redirection('/_connexion?suite=%2F');
  if (qui.role !== 'admin') return chemin.startsWith('/api/') ? json({ erreur: 'Accès refusé' }, 403) : texte('Le Studio est réservé à Kreative.', 403);
  if (!chemin.startsWith('/api/studio')) return servir('studio/index.html', env, ctx, { brut: false, origine: url.origin, req });
  try { return await apiStudio(req, env, ctx, url, chemin.slice('/api/studio'.length), req.method); }
  catch (e) { return json({ erreur: e.message || String(e) }, 500); }
}
async function servirVideoStudio(req, env, id, jeton) {
  const db = await baseStudio(env);
  const v = await db.prepare('SELECT cle, jeton, type FROM studio_videos WHERE id = ?').bind(id).first();
  if (!v || !egal(v.jeton || '', jeton) || !env.FICHIERS) return texte('Introuvable', 404);
  const plage = req.headers.get('Range');
  const o = await env.FICHIERS.get(v.cle, plage ? { range: req.headers } : undefined);
  if (!o) return texte('Introuvable', 404);
  const h = new Headers({ 'Content-Type': v.type || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex' });
  if (plage && o.range && o.range.offset != null) {
    const debut = o.range.offset, long = o.range.length != null ? o.range.length : o.size - debut;
    h.set('Content-Range', 'bytes ' + debut + '-' + (debut + long - 1) + '/' + o.size); h.set('Content-Length', String(long));
    return new Response(req.method === 'HEAD' ? null : o.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(o.size));
  return new Response(req.method === 'HEAD' ? null : o.body, { headers: h });
}
const VIDEO_PUBLIQUE = v => ({ id: v.id, statut: v.statut, nom: v.nom, taille: v.taille, legende: v.legende || '', format: v.format || '', essai: !!v.essai, essai_auto: !!v.essai_auto,
  partage_fil: v.partage_fil !== 0, publier_le: v.publier_le, media_id: v.media_id, permalink: v.permalink, erreur: v.erreur, publie_le: v.publie_le, cree_le: v.cree_le,
  apercu: '/_studio/video/' + v.id + '-' + v.jeton + '.mp4' });
const MEDIA_PUBLIC = x => { let s = {}; try { s = x.stats ? JSON.parse(x.stats) : {}; } catch (e) {}
  return { id: x.media_id, legende: x.legende || '', type: x.type, permalink: x.permalink, miniature: x.miniature, publie_le: x.publie_le, format: x.format || '', essai: !!x.essai, stats: s, stats_le: x.stats_le }; };

async function apiStudio(req, env, ctx, url, chemin, methode) {
  const db = await baseStudio(env);
  let m, b = {};
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(methode) && /json/.test(req.headers.get('Content-Type') || '')) { try { b = await req.json(); } catch (e) {} }
  if (chemin === '' && methode === 'GET') {
    const R = await reglageStudio(db);
    const [V, M, J] = await Promise.all([
      db.prepare("SELECT * FROM studio_videos WHERE statut != 'supprime' ORDER BY COALESCE(publier_le, cree_le) DESC LIMIT 500").all(),
      db.prepare('SELECT * FROM studio_medias WHERE COALESCE(masque, 0) = 0 ORDER BY publie_le DESC LIMIT 1000').all(),
      db.prepare('SELECT * FROM studio_jours ORDER BY jour DESC LIMIT 400').all()]);
    return json({ compte: { connecte: !!R.token, username: R.username || '', nom: R.nom || '', photo: R.photo || '', abonnes: R.abonnes || 0, token_le: R.token_le || null, erreur: R.erreur || '', stats_erreur: R.stats_erreur || '' },
      formats: Array.isArray(R.formats) ? R.formats : [], sync_le: R.sync_le || null, videos: V.results.map(VIDEO_PUBLIQUE), medias: M.results.map(MEDIA_PUBLIC), jours: J.results });
  }
  // ---- la connexion Instagram : le token est collé ici, vérifié, gardé ; jamais renvoyé ----
  if (chemin === '/connexion' && methode === 'POST') {
    const token = propre(b.token, 600).replace(/\s+/g, '');
    if (token.length < 20) return json({ erreur: 'Collez le token Instagram en entier.' }, 400);
    let moi;
    try { moi = await appelIG(env, '/me', { fields: 'user_id,username,name,profile_picture_url,followers_count,account_type', access_token: token }); }
    catch (e) { return json({ erreur: e.code === 190 ? 'Ce token ne marche pas. Générez-en un nouveau dans Meta, puis recollez-le.' : messageIG(e) }, 400); }
    const R = await enregistrerStudio(db, { token, token_le: maintenant(), user_id: String(moi.user_id || moi.id), username: moi.username || '', nom: moi.name || '',
      photo: moi.profile_picture_url || '', abonnes: moi.followers_count || 0, erreur: '' });
    ctx.waitUntil(synchroStudio(env, true).catch(() => {}));
    return json({ ok: true, username: R.username, abonnes: R.abonnes });
  }
  if (chemin === '/connexion' && methode === 'DELETE') { await enregistrerStudio(db, { token: null, erreur: '' }); return json({ ok: true }); }
  if (chemin === '/formats' && methode === 'PUT') {
    const F = [...new Set((Array.isArray(b.formats) ? b.formats : []).map(x => propre(x, 60)).filter(Boolean))].slice(0, 40);
    await enregistrerStudio(db, { formats: F });
    // un format renommé : ses vidéos suivent
    if (b.renomme && b.renomme.de && b.renomme.vers) {
      const de = propre(b.renomme.de, 60), vers = propre(b.renomme.vers, 60);
      await db.batch([db.prepare('UPDATE studio_videos SET format = ? WHERE format = ?').bind(vers, de), db.prepare('UPDATE studio_medias SET format = ? WHERE format = ?').bind(vers, de)]);
    }
    return json({ ok: true, formats: F });
  }
  // ---- déposer une vidéo (brouillon), puis la programmer ----
  if (chemin === '/videos' && methode === 'PUT') {
    if (!env.FICHIERS) return json({ erreur: 'Le stockage des fichiers n\'est pas branché.' }, 503);
    const taille = Number(req.headers.get('Content-Length') || 0);
    if (taille > STUDIO.max_octets) return json({ erreur: 'Vidéo trop lourde (95 Mo au maximum). Exportez-la un peu plus légère.' }, 413);
    const type = propre((req.headers.get('Content-Type') || 'video/mp4').split(';')[0], 60);
    if (!/^video\/(mp4|quicktime)$/.test(type)) return json({ erreur: 'Instagram accepte les vidéos MP4 ou MOV.' }, 415);
    const nom = propre(url.searchParams.get('nom'), 140).replace(/[^\p{L}\p{N}._ ()-]/gu, '_') || 'video.mp4';
    const id = 'sv_' + aleatoire(14), jeton = aleatoire(24), cle = 'studio/' + id + (type === 'video/quicktime' ? '.mov' : '.mp4');
    await env.FICHIERS.put(cle, req.body, { httpMetadata: { contentType: type } });
    await db.prepare(`INSERT INTO studio_videos (id, statut, nom, cle, jeton, type, taille, legende, format, essai, essai_auto, partage_fil, origine, cree_le)
      VALUES (?, 'brouillon', ?, ?, ?, ?, ?, '', '', 0, 0, 1, ?, ?)`).bind(id, nom, cle, jeton, type, taille, url.origin, maintenant()).run();
    return json(VIDEO_PUBLIQUE(await db.prepare('SELECT * FROM studio_videos WHERE id = ?').bind(id).first()));
  }
  if ((m = chemin.match(/^\/videos\/(sv_[A-Za-z0-9]+)(\/[a-z]+)?$/))) {
    const v = await db.prepare("SELECT * FROM studio_videos WHERE id = ? AND statut != 'supprime'").bind(m[1]).first();
    if (!v) return json({ erreur: 'Vidéo introuvable.' }, 404);
    const action = m[2] || '', modifiable = ['brouillon', 'programme', 'erreur'].includes(v.statut);
    if (action === '' && methode === 'PATCH') {
      if (!modifiable) return json({ erreur: v.statut === 'publie' ? 'Cette vidéo est déjà publiée.' : 'Cette vidéo est en cours de publication.' }, 409);
      const legende = b.legende != null ? String(b.legende).slice(0, 2200) : v.legende;
      if ((legende.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) return json({ erreur: 'Instagram limite la légende à 30 hashtags.' }, 400);
      const publier = b.publier_le != null ? Number(b.publier_le) || null : v.publier_le;
      let statut = v.statut;
      if (b.programmer === true) { if (!publier) return json({ erreur: 'Choisissez le jour et l\'heure de publication.' }, 400); statut = 'programme'; }
      if (b.programmer === false) statut = 'brouillon';
      await db.prepare(`UPDATE studio_videos SET legende = ?, format = ?, essai = ?, essai_auto = ?, partage_fil = ?, publier_le = ?, statut = ?,
        erreur = CASE WHEN ? = 'programme' THEN NULL ELSE erreur END, conteneur = CASE WHEN ? = 'programme' THEN NULL ELSE conteneur END WHERE id = ?`)
        .bind(legende, b.format != null ? propre(b.format, 60) : v.format, b.essai != null ? (b.essai ? 1 : 0) : v.essai, b.essai_auto != null ? (b.essai_auto ? 1 : 0) : v.essai_auto,
          b.partage_fil != null ? (b.partage_fil ? 1 : 0) : v.partage_fil, publier, statut, statut, statut, v.id).run();
      return json(VIDEO_PUBLIQUE(await db.prepare('SELECT * FROM studio_videos WHERE id = ?').bind(v.id).first()));
    }
    // publier tout de suite (ou réessayer après une erreur)
    if (action === '/maintenant' && methode === 'POST') {
      if (!modifiable) return json({ erreur: 'Cette vidéo est déjà partie.' }, 409);
      await db.prepare("UPDATE studio_videos SET statut = 'programme', publier_le = ?, erreur = NULL, conteneur = NULL WHERE id = ?").bind(maintenant(), v.id).run();
      const r = await avancerStudio(env, 8000);
      return json({ ok: true, ...r, video: VIDEO_PUBLIQUE(await db.prepare('SELECT * FROM studio_videos WHERE id = ?').bind(v.id).first()) });
    }
    if (action === '' && methode === 'DELETE') {
      if (['envoi', 'traitement'].includes(v.statut)) return json({ erreur: 'Elle est en train d\'être publiée : attendez une minute.' }, 409);
      if (env.FICHIERS) { try { await env.FICHIERS.delete(v.cle); } catch (e) {} }
      // une vidéo publiée reste sur Instagram et dans les statistiques ; seul le fichier est retiré
      if (v.statut === 'publie') await db.prepare("UPDATE studio_videos SET statut = 'supprime' WHERE id = ?").bind(v.id).run();
      else await db.prepare('DELETE FROM studio_videos WHERE id = ?').bind(v.id).run();
      return json({ ok: true });
    }
  }
  // un reel (publié par le Studio ou depuis l'app) : son format, essai ou non
  // retirer un reel publié du Studio (il disparaît du calendrier, de Vidéos et des statistiques). Instagram ne laisse
  // pas un outil supprimer, archiver ni modifier la légende d'un reel publié : ça se fait dans l'app.
  if ((m = chemin.match(/^\/medias\/([A-Za-z0-9_]+)$/)) && methode === 'DELETE') {
    await masquerMedia(db, env, m[1], 1);
    return json({ ok: true });
  }
  if ((m = chemin.match(/^\/medias\/([A-Za-z0-9_]+)$/)) && methode === 'PATCH') {
    const x = await db.prepare('SELECT media_id FROM studio_medias WHERE media_id = ?').bind(m[1]).first();
    if (!x) return json({ erreur: 'Reel introuvable.' }, 404);
    if (b.format != null) await db.prepare('UPDATE studio_medias SET format = ? WHERE media_id = ?').bind(propre(b.format, 60), x.media_id).run();
    if (b.essai != null) await db.prepare('UPDATE studio_medias SET essai = ? WHERE media_id = ?').bind(b.essai ? 1 : 0, x.media_id).run();
    return json({ ok: true });
  }
  // la page ouverte fait avancer les publications en cours (sans attendre le Cron)
  if (chemin === '/avancer' && methode === 'POST') return json(await avancerStudio(env, 8000));
  if (chemin === '/actualiser' && methode === 'POST') {
    try { return json(await synchroStudio(env, true)); } catch (e) { return json({ erreur: messageIG(e) }, 502); }
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ---------- publier : créer le conteneur Instagram, attendre qu'il soit prêt, publier ----------
async function avancerStudio(env, budgetMs) {
  const db = await baseStudio(env); let R = await reglageStudio(db); const fin = Date.now() + (budgetMs || 30000), fait = { lances: 0, publies: 0, erreurs: 0 };
  if (!R.token || !R.user_id) return { ...fait, connecte: false };
  // les vidéos tombées en erreur parce que Meta bloquait le compte (avant la v57) : de nouveau programmées
  await db.prepare("UPDATE studio_videos SET statut = 'programme', erreur = NULL WHERE statut = 'erreur' AND (erreur LIKE '%access blocked%' OR erreur LIKE '%refuse l''accès%' OR erreur LIKE '%limite les envois%')").run();
  // 1. les vidéos arrivées à leur heure : on les « prend » une par une (pas deux fois). Celles en retard de plus
  //    de 20 min (Meta bloquait, Worker arrêté…) partent une par passage, pour ne pas tout publier d'un coup.
  const dues = (await db.prepare("SELECT * FROM studio_videos WHERE statut = 'programme' AND publier_le <= ? ORDER BY publier_le LIMIT 5").bind(maintenant()).all()).results;
  let rattrapage = false;
  for (const v of dues) {
    if (maintenant() - v.publier_le > 20 * 60e3) { if (rattrapage) continue; rattrapage = true; }
    const pris = await db.prepare("UPDATE studio_videos SET statut = 'envoi' WHERE id = ? AND statut = 'programme'").bind(v.id).run();
    if (!pris.meta || pris.meta.changes !== 1) continue;
    const p = { media_type: 'REELS', video_url: (v.origine || 'https://studio.kreativeads.fr') + '/_studio/video/' + v.id + '-' + v.jeton + '.mp4', caption: v.legende || '', access_token: R.token };
    if (v.essai) p.trial_params = JSON.stringify({ graduation_strategy: v.essai_auto ? 'SS_PERFORMANCE' : 'MANUAL' });
    else p.share_to_feed = v.partage_fil === 0 ? 'false' : 'true';
    try {
      const c = await appelIG(env, '/' + R.user_id + '/media', p, 'POST');
      await db.prepare("UPDATE studio_videos SET statut = 'traitement', conteneur = ?, conteneur_le = ?, erreur = NULL WHERE id = ?").bind(String(c.id), maintenant(), v.id).run();
      fait.lances++;
      if (R.erreur) { R = await enregistrerStudio(db, { erreur: '' }); }
    } catch (e) {
      if (bloqueIG(e)) {
        // le compte est bloqué : la vidéo reste programmée (même heure), on s'arrête là pour ce passage
        await db.prepare("UPDATE studio_videos SET statut = 'programme' WHERE id = ? AND statut = 'envoi'").bind(v.id).run();
        await enregistrerStudio(db, { erreur: messageIG(e) });
        return { ...fait, connecte: e.code !== 190, bloque: messageIG(e) };
      }
      await db.prepare("UPDATE studio_videos SET statut = 'erreur', erreur = ? WHERE id = ?").bind(messageIG(e), v.id).run(); fait.erreurs++;
      if (e.code === 190) await enregistrerStudio(db, { erreur: messageIG(e) });
    }
  }
  // 2. les conteneurs en cours : Instagram traite la vidéo (souvent 10 s à 2 min), puis on publie
  for (let tour = 0; ; tour++) {
    const T = (await db.prepare("SELECT * FROM studio_videos WHERE statut = 'traitement' ORDER BY conteneur_le LIMIT 10").all()).results;
    let attente = false;
    for (const v of T) {
      try {
        const s = await appelIG(env, '/' + v.conteneur, { fields: 'status_code,status', access_token: R.token });
        if (s.status_code === 'FINISHED') {
          const pub = await appelIG(env, '/' + R.user_id + '/media_publish', { creation_id: v.conteneur, access_token: R.token }, 'POST');
          const mid = String(pub.id);
          let info = {}; try { info = await appelIG(env, '/' + mid, { fields: 'permalink,thumbnail_url,timestamp', access_token: R.token }); } catch (e) {}
          const fait_le = maintenant();
          await db.prepare("UPDATE studio_videos SET statut = 'publie', media_id = ?, permalink = ?, publie_le = ?, erreur = NULL WHERE id = ? AND statut = 'traitement'")
            .bind(mid, info.permalink || null, fait_le, v.id).run();
          await db.prepare(`INSERT INTO studio_medias (media_id, legende, type, permalink, miniature, publie_le, format, essai, video_id) VALUES (?, ?, 'REELS', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(media_id) DO UPDATE SET format = excluded.format, essai = excluded.essai, video_id = excluded.video_id`)
            .bind(mid, v.legende || '', info.permalink || null, info.thumbnail_url || null, fait_le, v.format || '', v.essai ? 1 : 0, v.id).run();
          fait.publies++;
        } else if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
          await db.prepare("UPDATE studio_videos SET statut = 'erreur', erreur = ? WHERE id = ?").bind('Instagram n\'a pas pu traiter la vidéo' + (s.status ? ' (' + String(s.status).slice(0, 160) + ')' : '') + '. Réessayez, ou exportez-la à nouveau en MP4 (H.264).', v.id).run();
          fait.erreurs++;
        } else if (maintenant() - (v.conteneur_le || 0) > 60 * 60e3) {
          await db.prepare("UPDATE studio_videos SET statut = 'erreur', erreur = 'Instagram traite la vidéo depuis plus d''une heure. Réessayez.' WHERE id = ?").bind(v.id).run();
          fait.erreurs++;
        } else attente = true;
      } catch (e) {
        // une erreur passagère au moment de publier : on retente au prochain passage ; un token mort : on arrête
        if (bloqueIG(e)) { await enregistrerStudio(db, { erreur: messageIG(e) }); return { ...fait, connecte: e.code !== 190, bloque: messageIG(e) }; }
        if (maintenant() - (v.conteneur_le || 0) > 60 * 60e3) { await db.prepare("UPDATE studio_videos SET statut = 'erreur', erreur = ? WHERE id = ?").bind(messageIG(e), v.id).run(); fait.erreurs++; }
        else attente = true;
      }
    }
    if (!attente || Date.now() + 5000 > fin) break;
    await new Promise(r => setTimeout(r, Math.min(5000, Math.max(0, fin - Date.now() - 1000))));
  }
  return { ...fait, connecte: true };
}

// ---------- les statistiques : le compte, les abonnés, et chaque reel (les plus récents d'abord) ----------
async function masquerMedia(db, env, mediaId, raison) {
  await db.prepare(`INSERT INTO studio_medias (media_id, masque) VALUES (?, ?) ON CONFLICT(media_id) DO UPDATE SET masque = excluded.masque`).bind(String(mediaId), raison).run();
  // sa vidéo du Studio n'est plus utile : le fichier est effacé, la vidéo ne s'affiche plus
  const { results: V } = await db.prepare("SELECT id, cle FROM studio_videos WHERE media_id = ? AND statut = 'publie'").bind(String(mediaId)).all();
  for (const v of V) {
    if (env.FICHIERS && v.cle) { try { await env.FICHIERS.delete(v.cle); } catch (e) {} }
    await db.prepare("UPDATE studio_videos SET statut = 'supprime' WHERE id = ?").bind(v.id).run();
  }
}
// Cloudflare (offre gratuite) limite un passage du Worker à 50 appels vers l'extérieur : au-delà, tout appel échoue
// (« Too many subrequests »). La mise à jour se donne donc un budget d'appels à Instagram et lit le reste au passage suivant.
async function synchroStudio(env, force, budget) {
  const db = await baseStudio(env);
  let appels = 0; const BUDGET = budget || STUDIO.appels_par_passe;
  const ig = (chemin, params) => { if (++appels > BUDGET) { const e = new Error('budget'); e.budget = true; throw e; } return appelIG(env, chemin, params); };
  const horsBudget = e => !!e && (e.budget || /too many subrequests/i.test(String(e.message || '')));
  let R = await reglageStudio(db);
  if (!R.token || !R.user_id) return { ok: false, connecte: false };
  if (!force && R.sync_le && maintenant() - R.sync_le < STUDIO.sync_toutes) return { ok: true, attendu: true };
  await enregistrerStudio(db, { sync_le: maintenant() });
  const T = R.token, jour = new Date().toISOString().slice(0, 10);
  try {
    const moi = await ig('/me', { fields: 'user_id,username,name,profile_picture_url,followers_count', access_token: T });
    R = await enregistrerStudio(db, { username: moi.username || R.username, nom: moi.name || R.nom, photo: moi.profile_picture_url || R.photo, abonnes: moi.followers_count || 0, erreur: '' });
    await db.prepare('INSERT INTO studio_jours (jour, abonnes) VALUES (?, ?) ON CONFLICT(jour) DO UPDATE SET abonnes = excluded.abonnes').bind(jour, moi.followers_count || 0).run();
  } catch (e) { if (bloqueIG(e)) { await enregistrerStudio(db, { erreur: messageIG(e) }); return { ok: false, connecte: e.code !== 190, erreur: messageIG(e) }; } throw e; }
  // les nouveaux abonnés par jour (30 derniers jours ; Instagram ne le donne qu'à partir de 100 abonnés)
  try {
    const depuis = Math.floor((Date.now() - 29 * 864e5) / 1000), jusque = Math.floor(Date.now() / 1000);
    const ins = await ig('/' + R.user_id + '/insights', { metric: 'follower_count', period: 'day', since: depuis, until: jusque, access_token: T });
    const vals = ((ins.data || []).find(x => x.name === 'follower_count') || {}).values || [];
    for (const x of vals) {
      const j = new Date(new Date(x.end_time).getTime() - 864e5).toISOString().slice(0, 10);
      await db.prepare('INSERT INTO studio_jours (jour, gagnes) VALUES (?, ?) ON CONFLICT(jour) DO UPDATE SET gagnes = excluded.gagnes').bind(j, Number(x.value) || 0).run();
    }
  } catch (e) {}
  // la liste des reels (jusqu'à 150), puis leurs statistiques
  const debutListe = maintenant();
  let suite = null, n = 0, plusAncien = Infinity, vus = 0;
  do {
    const p = suite ? Object.fromEntries(new URL(suite).searchParams) : { fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count', limit: 50, access_token: T };
    p.access_token = T;
    const page = await ig('/' + R.user_id + '/media', p);
    for (const x of page.data || []) {
      if (x.media_type !== 'VIDEO' && x.media_product_type !== 'REELS') continue;
      await db.prepare(`INSERT INTO studio_medias (media_id, legende, type, permalink, miniature, publie_le, vu_le) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_id) DO UPDATE SET legende = excluded.legende, type = excluded.type, permalink = excluded.permalink, miniature = COALESCE(excluded.miniature, studio_medias.miniature), publie_le = COALESCE(studio_medias.publie_le, excluded.publie_le), vu_le = excluded.vu_le,
          masque = CASE WHEN studio_medias.masque = 2 THEN 0 ELSE studio_medias.masque END`)
        .bind(String(x.id), x.caption || '', x.media_product_type || x.media_type, x.permalink || null, x.thumbnail_url || null, x.timestamp ? Date.parse(x.timestamp) : null, maintenant()).run();
      // likes et commentaires : donnés avec la liste, même quand Instagram refuse les statistiques détaillées d'un reel
      if (x.like_count != null || x.comments_count != null)
        await db.prepare("UPDATE studio_medias SET stats = json_set(COALESCE(stats, '{}'), '$.likes', ?, '$.comments', ?) WHERE media_id = ?")
          .bind(Number(x.like_count) || 0, Number(x.comments_count) || 0, String(x.id)).run();
    }
    for (const x of page.data || []) { vus++; if (x.timestamp) plusAncien = Math.min(plusAncien, Date.parse(x.timestamp)); }
    suite = page.paging && page.paging.next; n++;
  } while (suite && n < 3);
  // un reel déjà vu qu'Instagram ne renvoie plus a été archivé ou supprimé dans l'app : on le cache (il revient s'il est désarchivé).
  // Seulement sur la période que la liste couvre entièrement (toute la liste, ou les reels plus récents que le dernier lu).
  const complet = !suite, { results: partis } = await db.prepare(`SELECT media_id FROM studio_medias WHERE vu_le IS NOT NULL AND vu_le < ? AND COALESCE(masque, 0) = 0
    AND (? = 1 OR publie_le >= ?)`).bind(debutListe, complet ? 1 : 0, isFinite(plusAncien) ? plusAncien : maintenant()).all();
  // prudence : jamais si Instagram n'a rien renvoyé, ni plus de 10 d'un coup (une réponse incomplète ne doit rien cacher)
  if (vus > 0 && partis.length <= 10) for (const x of partis) await masquerMedia(db, env, x.media_id, 2);
  // les statistiques : jamais lues d'abord, puis les reels des 60 derniers jours, les moins à jour d'abord
  // (et ceux qui n'ont pas encore leurs vues, quel que soit leur âge)
  const aLire = (await db.prepare(`SELECT media_id, type, stats FROM studio_medias WHERE COALESCE(masque, 0) = 0 AND (stats_le IS NULL OR publie_le > ? OR json_extract(COALESCE(stats, '{}'), '$.views') IS NULL) ORDER BY CASE WHEN stats_le IS NULL THEN 0 ELSE 1 END, stats_le LIMIT ?`)
    .bind(maintenant() - 60 * 864e5, STUDIO.stats_par_passe).all()).results;
  // les métriques refusées sont retenues par type de publication (un reel n'a pas les mêmes qu'une vidéo du fil).
  // v60 : l'ancienne liste pouvait contenir TOUTES les métriques (un reel illisible les faisait toutes refuser) : on repart de zéro
  const KO = R.metriques_ko_v === 2 && R.metriques_ko && !Array.isArray(R.metriques_ko) ? R.metriques_ko : {};
  let nouvellesRefusees = R.metriques_ko_v !== 2, lus = 0, reussis = 0, erreurStats = null;
  for (const x of aLire) {
    if (appels >= BUDGET) break;   // le reste sera lu au prochain passage
    const t = x.type || 'REELS', refusees = new Set(KO[t] || []);
    const voulues = STUDIO.metriques.filter(k => !refusees.has(k)), stats = {};
    const lire = async liste => {
      const d = await ig('/' + x.media_id + '/insights', { metric: liste.join(','), access_token: T });
      for (const e of d.data || []) stats[e.name] = e.total_value ? e.total_value.value : ((e.values || [])[0] || {}).value;
    };
    try { if (voulues.length) await lire(voulues); }
    catch (e) {
      // plus d'appels possibles dans ce passage : on s'arrête sans rien écrire, ce reel sera lu au prochain
      if (horsBudget(e)) break;
      // le compte est coupé ou limité : on arrête là, sans rien effacer (on relira au prochain passage)
      if (e.code === 190 || e.code === 200 || [4, 17, 32, 613].includes(e.code) || /access blocked|request limit|too many calls/i.test(String(e.message || ''))) {
        await enregistrerStudio(db, { erreur: messageIG(e) }); break;
      }
      // une métrique refusée fait échouer tout l'appel : on les lit une par une. Une métrique n'est retenue comme refusée
      // que si d'autres marchent pour ce reel ; si aucune ne marche, c'est le reel qui est illisible (pas les métriques)
      const ok = [], ko = [];
      let coupe = false;
      // un reel qu'Instagram ne trouve pas (supprimé, reel d'essai retiré…) : inutile d'essayer chaque métrique
      const introuvable = /does not exist|unsupported get request|cannot be loaded/i.test(String(e.message || ''));
      if (!introuvable) for (const k of voulues) {
        try { await lire([k]); ok.push(k); } catch (e2) { if (horsBudget(e2)) { coupe = true; break; } ko.push([k, e2]); }
        if (!ok.length && ko.length >= 3) break;   // trois refus d'affilée : c'est le reel, pas les métriques
      }
      if (coupe) break;
      if (ok.length) { for (const [k, e2] of ko) if (e2.code === 100 || /metric/i.test(e2.message)) { refusees.add(k); nouvellesRefusees = true; } KO[t] = [...refusees]; }
      else erreurStats = String(e.message || e).slice(0, 200);
    }
    // on complète les statistiques déjà connues, on ne les efface jamais
    let avant = {}; try { avant = x.stats ? JSON.parse(x.stats) : {}; } catch (e) {}
    await db.prepare('UPDATE studio_medias SET stats = ?, stats_le = ? WHERE media_id = ?').bind(JSON.stringify({ ...avant, ...stats }), maintenant(), x.media_id).run();
    lus++; if (Object.keys(stats).length) reussis++;
  }
  // la raison d'Instagram, affichée seulement quand AUCUN reel n'a pu être lu (un reel supprimé à part ne doit pas alerter)
  await enregistrerStudio(db, { stats_erreur: lus && !reussis ? (erreurStats || '') : '' });
  // une métrique refusée pour un reel peut marcher pour un autre : on oublie la liste chaque semaine
  if (nouvellesRefusees) await enregistrerStudio(db, { metriques_ko: KO, metriques_ko_v: 2, metriques_ko_le: R.metriques_ko_v === 2 && R.metriques_ko_le || maintenant() });
  else if (R.metriques_ko_le && maintenant() - R.metriques_ko_le > 7 * 864e5) await enregistrerStudio(db, { metriques_ko: {}, metriques_ko_le: null });
  return { ok: true, connecte: true, reels: lus };
}

// ---------- le token dure 60 jours : on le prolonge tout seul ----------
async function prolongerTokenStudio(env) {
  const db = await baseStudio(env), R = await reglageStudio(db);
  if (!R.token || !R.token_le || maintenant() - R.token_le < STUDIO.rafraichir_apres) return;
  try {
    const d = await appelIG(env, '/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: R.token }, 'GET', true);
    if (d.access_token) await enregistrerStudio(db, { token: d.access_token, token_le: maintenant(), erreur: '' });
  } catch (e) { if (e.code === 190) await enregistrerStudio(db, { erreur: messageIG(e) }); }
}
// ---------- le Cron : publier ce qui est dû, prolonger le token, relire les statistiques (toutes les heures) ----------
async function cronStudio(env) {
  try { await avancerStudio(env, 40000); } catch (e) {}
  try { await prolongerTokenStudio(env); } catch (e) {}
  try { await synchroStudio(env, false, 25); } catch (e) {}
}

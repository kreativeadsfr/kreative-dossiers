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
  async fetch(req, env, ctx) {
    try { return await traiter(req, env, ctx); }
    catch (e) { return new Response('Erreur : ' + (e && e.message || e), { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
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
  //   https://app.kreativeads.fr/payer/custom?creas=45&options=express,ab_visuel
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

  // ---------- portail client et API (voir « PORTAIL » plus bas) ----------
  const portail = await routerPortail(req, env, ctx, url, chemin);
  if (portail) return portail;

  if (req.method !== 'GET' && req.method !== 'HEAD') return texte('Méthode non autorisée', 405);

  // ---------- fichiers publics (la page de connexion en a besoin) ----------
  if (PUBLICS.test(chemin)) return servir(chemin.slice(1), env, ctx, { brut: false, origine: url.origin, req });

  // ---------- tout le reste : connecté seulement ----------
  const page = /\.html?$|\/$/.test(chemin) || !/\.[a-z0-9]{1,5}$/i.test(chemin);
  const qui = await session(req, env);
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
const DESIGNER_OK = /^\/(designer\/.*|[A-Za-z0-9_-]+\/creas\/.*|projets\.json|[A-Za-z0-9_-]+\/(donnees|envois|livraison)\.json|signaler\.js|ui\/.*|favicon-\d+\.png|logo-kreative\.png)$/;
function autorise(role, chemin) {
  if (role === 'admin') return true;
  if (/^\/(admin|_admin|client)(\/|$)/.test(chemin)) return false;
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
const CACHE_PAGES = new Map();
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

  const ext = (derniere.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1];
  const type = TYPES[(ext || '').toLowerCase()] || 'application/octet-stream';
  const estTexte = TEXTES.test(type);

  // les fichiers lourds (images, polices...) : cache de 5 minutes
  const cache = caches.default;
  const cleCache = new Request('https://cache.kreative/' + (o.brut ? 'b/' : 'p/') + encodeURI(fichier) + new URL(o.req.url).search);
  if (!estTexte) {
    const vu = await cache.match(cleCache);
    if (vu) return vu;
  }

  // les petits JSON lus par les pages de l'équipe (projets.json, donnees.json...) :
  // 15 s en mémoire, pour ne pas relire GitHub à chaque ouverture de page
  const jsonPage = !o.brut && /\.json$/i.test(fichier);
  if (jsonPage) {
    const vu = CACHE_PAGES.get(fichier);
    if (vu && vu.fin > Date.now()) return new Response(vu.t, { status: vu.s, headers: { 'Content-Type': TYPES.json, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  const r = await lireGithub(fichier, env, 'GET');
  if (jsonPage && (r.ok || r.status === 404)) {
    const t = r.ok ? remplacer(await r.text(), o.origine + '/') : 'Introuvable';
    if (t.length < 300000) {                       // les gros fichiers ne restent pas en mémoire
      if (CACHE_PAGES.size > 400) CACHE_PAGES.clear();
      CACHE_PAGES.set(fichier, { t, s: r.ok ? 200 : 404, fin: Date.now() + 15000 });
    }
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
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cleCache, rep.clone()));
    return rep;
  }
  if (o.brut) return new Response(r.body, { status: 200, headers: entetes });

  // les pages : les anciens liens GitHub deviennent ce site
  const base = o.origine + '/';
  if (/^text\/html/.test(type)) return reecrireHtml(new Response(r.body, { status: 200, headers: entetes }), base, coquille(o.qui, '/' + chemin, o.req));
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
  if (/^\/(admin|client|strategiste|designer)(\/|$)/.test(chemin)) return null;   // les portails ont leur propre coquille
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
    '<a class="kc-logo" href="' + ACCUEILS[role] + '"><img src="/ui/logo-kreative-noir.png" alt="Kreative"></a>' + cta + nav +
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
  if (/^\/(admin|client|strategiste|designer|ui|_[a-z]+)(\/|$)/.test(chemin)) return null;
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
.logo{height:26px;display:block;margin:0 0 30px}
h1{font:600 32px/1.05 "Inter Tight",Inter,sans-serif;letter-spacing:-.035em;margin:0 0 8px}
p{margin:0 0 24px;color:#5b5752;font-size:15px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 8px}
input{display:block;width:100%;font:inherit;padding:14px 18px;border:1px solid #e3dcd5;border-radius:999px;background:#f9f6f4;outline:0}
input:focus{border-color:#4d94ff;background:#fff}
button{margin-top:16px;width:100%;padding:14px 20px;border:0;border-radius:999px;background:#4d94ff;color:#fff;font:600 15px Inter,sans-serif;cursor:pointer}
button:hover{background:#1f1f1f}
.err{margin:14px 0 0;color:#b3261e;font-size:14px}
</style></head><body><form class="c" method="post" action="/_connexion">
<img class="logo" src="/ui/logo-kreative-noir.png" alt="Kreative">
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
  { id: 'express', nom: 'Livraison express', detail: 'Livrée 2 fois plus vite', type: 'fixe', valeur: 390, par_pack: { starter: 90, growth: 190, scale: 290, custom: 390 } },
  { id: 'ab_visuel', nom: 'A/B test visuel', detail: 'Même texte sur 2 visuels différents', type: 'par_crea', valeur: 20 },
  { id: 'ab_texte', nom: 'A/B test texte', detail: 'Même visuel avec 2 textes différents', type: 'par_crea', valeur: 15 }
];
// Le pack Custom se configure dans l'espace client : nombre de créas et options.
const prixOption = (o, pack) => (o.par_pack && o.par_pack[pack] != null) ? o.par_pack[pack] : o.valeur;
const CUSTOM = {
  min: 30, max: 100, pas: 5,
  // délai de livraison selon le volume : [jusqu'à N créas, heures]
  delais: [[30, 72], [50, 96], [70, 120], [100, 168]],
  paliers: [[30, 35], [50, 32], [75, 29]],          // à partir de N créas : prix par créa
  remise_mensuel: 0.15,
  options: OPTIONS
};
// prix d'un pack (fixe ou Custom) avec ses options. Mensuel : abonnement, remise de 15 %
// (déjà comprise dans le prix mensuel des packs fixes, appliquée aussi aux options).
function devis(pack, formule, nbDemande, optionsDemandees) {
  const m = formule === 'mensuel';
  // une option : « express », ou « ab_visuel:5 » (5 créas en A/B test, au plus le nombre de créas du pack)
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
  if (pack === 'custom' && m) base = base * (1 - CUSTOM.remise_mensuel);
  for (const o of options) if (o.type === 'pct') base += base * o.valeur / 100;
  for (const o of options) if (o.type === 'fixe') base += prixOption(o, pack);
  const total = Math.round(base);
  const P = PACKS[pack];
  const nomOpt = o => o.nom + (o.type === 'par_crea' ? ' × ' + o.qte : '');
  // ce que voit le client sur la page Stripe : le nom du pack, puis le contenu en points
  const points = [nb + (pack === 'custom' ? ' créatives' : ' visuels statiques') + (m ? ' par mois' : ''), 'Livrés en 1:1, 4:5 et 9:16'].concat(options.map(nomOpt));
  return { pack, formule: m ? 'mensuel' : 'unique', nb, options: options.map(o => o.type === 'par_crea' ? o.id + ':' + o.qte : o.id), unitaire, total,
    nom: 'Pack ' + P.nom, description: points.join(' • '),
    libelle: 'Pack ' + P.nom + (m ? ' · abonnement mensuel' : ' · paiement en une fois') + ' · ' + nb + ' créatives' + (m ? ' par mois' : '') +
      (options.length ? ' · ' + options.map(nomOpt).join(', ') : '') };
}

// le délai de livraison (en heures, après le brief) : celui du pack, ou selon le volume
// pour le Custom ; l'express le divise par deux
function delaiHeures(pack, nb, options) {
  const h = pack === 'custom' ? (CUSTOM.delais.find(x => (nb || 0) <= x[0]) || CUSTOM.delais[CUSTOM.delais.length - 1])[1] : (PACKS[pack] || PACKS.growth).delai;
  return String(options || '').includes('express') ? Math.round(h / 2) : h;
}

// brief = commande confirmée, le brief n'est pas encore arrivé
const STATUTS = ['brief', 'production', 'livre', 'revisions', 'valide', 'annule'];

let BASE_PRETE = false;
async function base(env) {
  if (!env.DB) throw new Error('Base de données absente : liez une base D1 au Worker sous le nom DB.');
  if (!BASE_PRETE) {
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
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_cmd_client ON commandes(client_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_act_client ON activite(client_id, le)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_fac_client ON factures(client_id)`)
    ]);
    // colonnes ajoutées après coup : sans effet si elles existent déjà
    for (const col of ['avis_le INTEGER', 'avis_ignore_le INTEGER', 'valide_le INTEGER', 'stripe_session TEXT', 'stripe_abo TEXT', 'stripe_facture TEXT', 'options TEXT', 'brief_json TEXT']) {
      try { await env.DB.prepare('ALTER TABLE commandes ADD COLUMN ' + col).run(); } catch (e) {}
    }
    for (const col of ['stripe_le INTEGER', 'offre_le INTEGER']) { try { await env.DB.prepare('ALTER TABLE abonnements ADD COLUMN ' + col).run(); } catch (e) {} }
    for (const col of ['stripe_client TEXT', 'photo TEXT', 'photo_le INTEGER', 'app_le INTEGER']) {
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
        ctx.waitUntil(envoyerEmail(env, emailAcces(url, cl, lienAcces(url, cl.jeton))));
        ctx.waitUntil(noter(db, cl.id, null, 'lien', 'Lien d\'accès redemandé par email'));
      }
    }
    await new Promise(r => setTimeout(r, 400));
    return json({ ok: true, message: 'Si cette adresse correspond à un compte Kreative, vous allez recevoir votre lien d\'accès dans quelques minutes.' });
  }

  // ---- Stripe (public, signé) ----
  if (chemin === '/api/stripe/webhook' && methode === 'POST') return stripeWebhook(req, env, ctx, url);
  // ---- n8n (clé dans l'en-tête X-Kreative-Cle) ----
  if (chemin.startsWith('/api/n8n/')) return apiN8n(req, env, ctx, url, chemin.slice('/api/n8n'.length), methode);
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
      (/^\/livraisons\/[A-Za-z0-9_-]{3,80}$/.test(sousChemin) && methode === 'GET') ||
      (/^\/livraisons\/l_[A-Za-z0-9_]+\/retouches-faites$/.test(sousChemin) && methode === 'POST') ||
      (sousChemin === '/commentaires' && methode === 'POST') || (/^\/commentaires\/\d+$/.test(sousChemin) && methode === 'DELETE')))
      return json({ erreur: 'Accès refusé' }, 403);
    return apiEquipe(req, env, ctx, url, chemin.slice('/api/equipe'.length), methode, qui);
  }

  // ---- l'app de l'espace client (à installer sur l'écran d'accueil) : manifeste et service worker, publics ----
  if (chemin === '/client/manifest.webmanifest') return new Response(JSON.stringify(MANIFESTE), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  if (chemin === '/client/sw.js') return new Response(SERVICE_WORKER, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/client/' } });
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
    const liv = await apiClientLivraisons(req, env, ctx, url, chemin.slice('/api/client'.length), methode, cl, apercu);
    if (liv) return liv;
    return apiClient(req, env, ctx, url, chemin.slice('/api/client'.length), methode, cl, apercu);
  }
  if (!cl && !admin) return redirection('/client/connexion');
  if (methode !== 'GET' && methode !== 'HEAD') return texte('Méthode non autorisée', 405);
  // une seule page pour tout le portail (les écrans changent sans recharger)
  if (chemin === '/client' ) return redirection('/client/' + url.search);
  if (/^\/client\/[^.]*$/.test(chemin)) return servir('client/index.html', env, ctx, { brut: false, origine: url.origin, req });
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
  try { const r = await lireGithub(chemin, env, 'GET'); v = r.ok ? await r.json() : null; } catch (e) { v = null; }
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
    d = donnees;
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
        const { results: L } = await (await baseLiv(env)).prepare("SELECT dossier, statut FROM livraisons WHERE statut IN ('envoyee','review_terminee','approuvee') AND (" +
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
    ['lumen', 'Maison Lumen', 'Hugo Lambert', [['growth', 'unique', 12, 490, 'TEST_DEMO_LUMEN', 'production', 2, null]], 'Brief reçu, fiche à remplir'],
    ['sable', 'Atelier Sable', 'Clara Petit', [['starter', 'unique', 6, 280, 'TEST_DEMO_SABLE', 'production', 4, null]], 'Fiche en retard'],
    ['nordik', 'Nordik Café', 'Erik Dahl', [['custom', 'unique', 40, 1360, 'TEST_DEMO_NORDIK', 'production', 6, null]], 'Sur-mesure en 2 livraisons, brief de la livraison 2 reçu'],
    ['velvo', 'Velvo', 'Sami Benali', [['scale', 'unique', 24, 890, 'TEST_DEMO_VELVO', 'production', 5, null]], 'Chez la designer, en retard'],
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
    for (const [pack, formule, creas, prix, dossier, statut, ilya, extra] of cmds) {
      n++;
      const k = 'k_demo_' + slug + '_' + n, cree = now - ilya * J, brief = statut === 'brief' ? null : cree + J;
      const livre = ['livre', 'revisions', 'valide'].includes(statut) ? cree + 3 * J : null;
      await db.prepare(`INSERT INTO commandes (id, ref, client_id, pack, formule, nb_creas, prix, dossier, statut, cree_le, brief_le, livre_le, valide_le, avis_le)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(k, 'DEMO-' + n, id, pack, formule, creas, prix, dossier, statut, cree, brief, livre,
          statut === 'valide' ? cree + 5 * J : null, extra === 'avis' ? cree + 5 * J : null).run();
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
    return json(personnes(env).map(x => ({ nom: x.nom, role: x.role, espace: ACCUEILS[x.role] })));
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
  // une partie d'un projet livré en plusieurs fois : le même message dit aussi de remplir le brief de la suite (pas de 2e notification)
  const suite = !finale && l.version <= 1;
  const notif = notifier(env, k.client_id, { titre: l.version > 1 ? 'La nouvelle version est prête' : 'Vos créatives sont prêtes', texte: k.marque + ' · ' + (l.version > 1 ? 'version ' + l.version + ', avec vos retouches.' : suite ? 'regardez-les, puis remplissez le brief de la livraison suivante.' : 'regardez-les et dites-nous ce que vous en pensez.'), url: '/client/#/projets/' + k.id + '/creatives' });
  if (ctx && ctx.waitUntil) ctx.waitUntil(notif); else await notif;
  if (k.email && k.jeton && !/^TEST_DEMO_/.test(l.dossier)) {
    const prenom = String(k.contact || '').trim().split(/\s+/)[0], lien = lienAcces(url, k.jeton);
    const envoi = envoyerEmail(env, { type: 'creatives', a: k.email, marque: k.marque, contact: k.contact || '', lien,
      sujet: k.marque + (l.version > 1 ? ' · la nouvelle version de vos créatives' : ' · vos créatives sont prêtes'),
      html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
        paragraphes: [l.version > 1 ? 'La nouvelle version de vos créatives est prête, avec les retouches demandées.' : 'Vos créatives sont prêtes. Regardez-les format par format, commentez ce qui doit bouger, et approuvez ce qui vous plaît.']
          .concat(suite ? ['Ensuite, remplissez le brief de la livraison suivante depuis votre espace (rubrique « Mon brief ») : il lance la suite de votre projet.'] : []),
        bouton: ['Voir mes créatives', lien] }) });
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
    db.prepare("SELECT dossier, statut FROM commandes WHERE dossier IS NOT NULL ORDER BY cree_le").all()]);
  const etats = {}, de = d => (etats[d] = etats[d] || {});
  for (const l of L) de(l.dossier).v = { id: l.id, version: l.version, statut: l.statut, retouche: ['a_corriger', 'review_terminee'].includes(l.statut) ? (l.retouche || 'designer') : null,
    le: Math.max(l.cree_le || 0, l.depose_le || 0, l.verifie_le || 0, l.envoye_le || 0, l.review_le || 0, l.retouche_le || 0) };
  for (const o of O) de(o.dossier).o = { etape: o.etape, le: o.le, par: o.par };
  const commandes = {};
  for (const k of K2) commandes[k.dossier] = k.statut;
  return { etats, commandes, le: maintenant() };
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
  // toutes les livraisons (la liste de l'admin, l'historique de la designer)
  if (chemin === '/livraisons' && methode === 'GET') {
    const { results } = await db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id) AS nb,
      (SELECT COUNT(*) FROM commentaires c WHERE c.livraison_id = l.id AND c.interne = 0) AS nb_client,
      (SELECT COUNT(*) FROM fichiers f WHERE f.livraison_id = l.id AND f.approuve_le IS NOT NULL) AS nb_approuves
      FROM livraisons l ORDER BY COALESCE(l.depose_le, l.cree_le) DESC LIMIT 300`).all();
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
    return json({ ok: true, message: 'Merci, la designer peut faire la nouvelle version.' });
  }
  // l'état de chaque projet, le même pour tout le monde (admin, stratégiste, designer)
  if (chemin === '/etats' && methode === 'GET') return json(await etatsProduction(db));
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
      if (k && await estDerniereLivraison(env, l.dossier) && !['valide', 'annule'].includes(k.statut)) {
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
    const envoi = envoyerEmail(env, { type: 'review', a: env.EMAIL_KREATIVE || 'contact@kreativeads.fr', marque: cl.marque, contact: 'Kreative', lien: url.origin + '/admin/#/livraisons/' + l.dossier,
      sujet: cl.marque + ' · retours du client sur la version ' + l.version,
      html: emailHtml(url.origin, { titre: cl.marque + ' a terminé sa review', paragraphes: [(t.n - t.reste) + ' fichier' + (t.n - t.reste > 1 ? 's' : '') + ' approuvé' + (t.n - t.reste > 1 ? 's' : '') + ' sur ' + t.n + ', ' + t.coms + ' commentaire' + (t.coms > 1 ? 's' : '') + '. ' + (pour === 'strategiste' ? 'Les retours parlent des textes : le stratégiste corrige d\'abord, puis la designer fait la nouvelle version.' : 'La designer voit les retours dans son espace et prépare la nouvelle version.') + ' Vous pouvez changer qui s\'en occupe depuis la livraison.'],
        bouton: ['Voir les retours', url.origin + '/admin/#/livraisons/' + l.dossier] }) });
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
        if (!faits.has(partie)) { c.brief_suivant = { dossier: partie, n: n + 1, sur: l.sur }; break; }
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
  if (s.status !== 'canceled' && fin && mini && fin < mini - 86400 && !(avant && avant.stripe_le && quand < avant.stripe_le) && env.STRIPE_SECRET) {
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
// un nouveau mois d'abonnement commence : la production attend son brief, le client est prévenu (notification + email)
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
async function prevenirBriefDuMois(env, url, clientId) {
  try {
    const db = await base(env);
    const cl = await db.prepare('SELECT marque, email, contact, jeton FROM clients WHERE id = ?').bind(clientId).first();
    if (!cl) return;
    const m = MOIS_FR[Number(new Date().toLocaleString('en-US', { month: 'numeric', timeZone: 'Europe/Paris' })) - 1];
    const deMois = (/^[ao]/.test(m) ? 'd\'' : 'de ') + m;
    await notifier(env, clientId, { titre: 'Votre brief ' + deMois, texte: cl.marque + ' · votre nouveau mois commence : dites-nous ce que vous souhaitez ce mois-ci.', url: '/client/#/brief' });
    if (cl.email && cl.jeton && url) {
      const prenom = String(cl.contact || '').trim().split(/\s+/)[0], lien = lienAcces(url, cl.jeton);
      await envoyerEmail(env, { type: 'brief_mois', a: cl.email, marque: cl.marque, contact: cl.contact || '', lien, sujet: cl.marque + ' · votre brief ' + deMois,
        html: emailHtml(url.origin, { titre: 'Bonjour' + (prenom ? ' ' + prenom : '') + ',',
          paragraphes: ['Votre nouveau mois d\'abonnement commence. Dites-nous en deux minutes ce qui a marché le mois dernier et ce que vous souhaitez ce mois-ci : la production démarre dès que votre brief est reçu.'],
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
        await prevenirBriefDuMois(env, url, derniere.client_id);
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

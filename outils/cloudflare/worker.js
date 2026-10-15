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
const PUBLICS = /^\/(ui\/kreative\.css|ui\/app\.(css|js)|ui\/logo-[a-z0-9-]+\.png|favicon-\d+\.png)$/;
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
  return servir(chemin.slice(1), env, ctx, { brut: false, origine: url.origin, req, qui });
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
  if (/^\/(admin|client)(\/|$)/.test(chemin)) return null;          // ont leur propre coquille
  const url = new URL(req.url);
  const pg = typePage(chemin, url);
  const role = qui.role, en = role === 'designer';
  const e = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lien = (href, icone, texte, on) => '<a class="kc-l' + (on ? ' on' : '') + '" href="' + e(href) + '">' + IC[icone] + '<span>' + e(texte) + '</span></a>';
  const lab = t => '<div class="kc-lab">' + e(t) + '</div>';

  // la barre latérale de chaque rôle
  let nav = '', cta = '';
  if (role === 'admin') {
    cta = '<a class="kc-cta" href="/admin/#/clients/nouveau"><span>Nouveau client</span>' + IC.fleche + '</a>';
    nav = lab('Espace') + '<div class="kc-nav">' + lien('/admin/#/', 'accueil', 'Vue d\'ensemble') + '</div>' +
      lab('Commercial') + '<div class="kc-nav">' + lien('/admin/#/clients', 'gens', 'Clients') + lien('/admin/#/commandes', 'sac', 'Commandes') + '</div>' +
      lab('Production') + '<div class="kc-nav">' + lien('/admin/#/projets', 'dossier', 'Projets') + lien('/admin/#/dossiers', 'calques', 'Tous les dossiers') +
        lien('/fiche/', 'doc', 'Fiche créas', pg.type === 'fiche' && !pg.projet) +
        lien('/strategiste/', 'ampoule', 'Espace stratégiste', pg.type === 'strategiste') +
        lien('/designer/', 'pinceau', 'Designer space', pg.type === 'designer') + '</div>' +
      lab('Équipe') + '<div class="kc-nav">' + lien('/admin/#/equipe', 'bouclier', 'Équipe') + '</div>';
  } else if (role === 'strategiste') {
    nav = lab('Espace') + '<div class="kc-nav">' + lien('/strategiste/', 'dossier', 'Mes projets', pg.type === 'strategiste') +
      lien('/fiche/', 'doc', 'Fiche créas', pg.type === 'fiche' && !pg.projet) + '</div>';
  } else {
    nav = lab('Workspace') + '<div class="kc-nav">' + lien('/designer/', 'dossier', 'My projects', pg.type === 'designer') + '</div>';
  }
  // « Ce projet » : rempli par coquille.js (il lit le projet dans le dépôt)
  if (pg.projet) nav += '<div id="kc-projet" hidden>' + lab(en ? 'This project' : 'Ce projet') + '<div class="kc-nav" id="kc-projet-l"></div></div>';

  // le fil d'Ariane
  const racine = role === 'admin' ? 'Production' : en ? 'Designer' : 'Stratégiste';
  const noms = en
    ? { designer: 'My projects', apercu: 'Preview', telech: 'Download', autre: 'Page' }
    : { strategiste: role === 'admin' ? 'Espace stratégiste' : 'Mes projets', designer: 'Designer space', fiche: 'Fiche créas', retours: 'Brief du client',
        dossier: 'Dossier de production', apercu: 'Visuels', telech: 'Téléchargement', autre: 'Page' };
  const ariane = IC.dossier + '<span>' + e(racine) + '</span><i>/</i>' +
    (pg.projet ? '<span id="kc-nom">' + e(pg.projet) + '</span><i>/</i>' : '') +
    '<b id="kc-page">' + e(noms[pg.type] || 'Page') + '</b>';

  const nom = qui.nom ? qui.nom.charAt(0).toUpperCase() + qui.nom.slice(1) : '';
  const titre = role === 'admin' ? 'Fondateur · admin' : en ? 'Designer' : 'Stratégiste';
  const conf = { role, langue: en ? 'en' : 'fr', type: pg.type, projet: pg.projet || '' };

  const ouverture = '<div class="kc" id="kc"><div class="kc-side" id="kc-side">' +
    '<a class="kc-logo" href="' + ACCUEILS[role] + '"><img src="/ui/logo-kreative-noir.png" alt="Kreative"></a>' + cta + nav +
    '<div class="kc-foot"><span class="kc-av">' + e(nom.charAt(0) || '?') + '</span><div class="kc-qui"><b>' + e(nom) + '</b><small>' + e(titre) + '</small></div>' +
    '<button class="kc-mb" id="kc-mb" type="button" aria-label="Menu">' + IC.points + '</button>' +
    '<div class="kc-menu" id="kc-menu" hidden><a href="/_deconnexion">' + IC.sortie + '<span>' + (en ? 'Log out' : 'Se déconnecter') + '</span></a></div></div></div>' +
    '<div class="kc-main"><div class="kc-panel"><div class="kc-top">' +
    '<button class="kc-ib kc-burger" id="kc-burger" type="button" aria-label="Menu">' + IC.menu + '</button>' +
    '<div class="kc-ariane">' + ariane + '</div>' +
    '<div class="kc-search">' + IC.chercher + '<input id="kc-cherche" placeholder="' + (en ? 'Search a project…' : 'Rechercher un projet…') + '" autocomplete="off"><kbd>⌘K</kbd><div class="kc-res" id="kc-res" hidden></div></div>' +
    '</div><div class="kc-scroll" id="kc-scroll">';
  const fermeture = '</div></div></div></div>';
  const tete = '<link rel="stylesheet" href="/ui/coquille.css"><script>window.KC=' + JSON.stringify(conf).replace(/</g, '\\u003c') + '</script><script src="/ui/coquille.js" defer></script>';
  return { tete, ouverture, fermeture, classe: 'kc-on kc-' + pg.type };
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
<title>Kreative</title><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
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
// Le pack Custom se configure dans l'espace client : nombre de créas et options.
// Le prix est TOUJOURS recalculé ici, jamais pris dans ce qu'envoie le navigateur.
const CUSTOM = {
  min: 30, max: 100, pas: 5,
  paliers: [[30, 35], [50, 32], [75, 29]],          // à partir de N créas : prix par créa
  remise_mensuel: 0.15,
  options: [
    { id: 'express', nom: 'Livraison express 24 h', detail: '+20 % sur le total', type: 'pct', valeur: 20 },
    { id: 'hooks', nom: '3 accroches par visuel', detail: '+8 € par créa', type: 'par_crea', valeur: 8 },
    { id: 'ab', nom: 'A/B test', detail: '2 versions par créa : même texte sur 2 visuels, ou même visuel avec 2 textes · +12 € par créa', type: 'par_crea', valeur: 12 }
  ]
};
function devis(pack, formule, nbDemande, optionsDemandees) {
  const m = formule === 'mensuel';
  if (pack !== 'custom') {
    const P = PACKS[pack] || PACKS.growth;
    return { pack: PACKS[pack] ? pack : 'growth', formule: m ? 'mensuel' : 'unique', nb: P.creas, options: [], total: m ? P.mensuel : P.unique,
      libelle: 'Pack ' + P.nom + ' · ' + P.creas + ' créatives' + (m ? ' par mois' : '') };
  }
  let nb = Math.round(Number(nbDemande) || CUSTOM.min);
  nb = Math.min(CUSTOM.max, Math.max(CUSTOM.min, Math.round(nb / CUSTOM.pas) * CUSTOM.pas));
  const unitaire = CUSTOM.paliers.filter(x => nb >= x[0]).pop()[1];
  const options = CUSTOM.options.filter(o => (optionsDemandees || []).includes(o.id));
  let base = nb * unitaire;
  for (const o of options) if (o.type === 'par_crea') base += nb * o.valeur;
  for (const o of options) if (o.type === 'pct') base += base * o.valeur / 100;
  if (m) base = base * (1 - CUSTOM.remise_mensuel);
  const fixe = options.filter(o => o.type === 'fixe').reduce((t, o) => t + o.valeur, 0);
  const total = Math.round(base + fixe);
  return { pack: 'custom', formule: m ? 'mensuel' : 'unique', nb, options: options.map(o => o.id), unitaire, total,
    libelle: 'Pack Custom · ' + nb + ' créatives' + (m ? ' par mois' : '') + (options.length ? ' · ' + options.map(o => o.nom).join(', ') : '') };
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
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_cmd_client ON commandes(client_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_act_client ON activite(client_id, le)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_fac_client ON factures(client_id)`)
    ]);
    // colonnes ajoutées après coup : sans effet si elles existent déjà
    for (const col of ['avis_le INTEGER', 'avis_ignore_le INTEGER', 'valide_le INTEGER', 'stripe_session TEXT', 'stripe_abo TEXT', 'stripe_facture TEXT', 'options TEXT']) {
      try { await env.DB.prepare('ALTER TABLE commandes ADD COLUMN ' + col).run(); } catch (e) {}
    }
    for (const col of ['stripe_client TEXT', 'photo TEXT', 'photo_le INTEGER']) {
      try { await env.DB.prepare('ALTER TABLE clients ADD COLUMN ' + col).run(); } catch (e) {}
    }
    try { await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS i_cmd_session ON commandes(stripe_session)').run(); } catch (e) {}
    BASE_PRETE = true;
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
        ctx.waitUntil(envoyerEmail(env, { type: 'acces', a: cl.email, marque: cl.marque, contact: cl.contact || '', lien: lienAcces(url, cl.jeton) }));
        ctx.waitUntil(noter(db, cl.id, null, 'lien', 'Lien d\'accès redemandé par email'));
      }
    }
    await new Promise(r => setTimeout(r, 400));
    return json({ ok: true, message: 'Si cette adresse correspond à un compte Kreative, vous allez recevoir votre lien d\'accès dans quelques minutes.' });
  }

  // ---- Stripe (public, signé) ----
  if (chemin === '/api/stripe/webhook' && methode === 'POST') return stripeWebhook(req, env, ctx, url);

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
    return apiClient(req, env, ctx, url, chemin.slice('/api/client'.length), methode, cl, !!admin && !(await sessionClient(req, env)));
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
  CACHE_JSON.set(chemin, { v: v && JSON.stringify(v).length > 300000 ? { deadline: v.deadline, brand_name: v.brand_name, envois: v.envois, livre: v.livre } : v, fin: Date.now() + 20000 });
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
  const deadline = cmd.deadline || (d && Date.parse(d.deadline)) || (cmd.brief_le ? cmd.brief_le + P.delai * 36e5 : null);
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
    const [{ results: activite }, { results: factures }] = await Promise.all([
      db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 12').bind(cl.id).all(),
      db.prepare("SELECT * FROM factures WHERE client_id = ? AND statut != 'brouillon' ORDER BY emise_le DESC").bind(cl.id).all()]);
    if (!apercu) ctx.waitUntil(db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(maintenant(), cl.id).run());
    return json({ apercu, client: { id: cl.id, marque: cl.marque, contact: cl.contact, email: cl.email, telephone: cl.telephone, site: cl.site, cree_le: cl.cree_le, photo_le: cl.photo ? cl.photo_le || 1 : null },
      commandes, activite, factures: factures.map(FACTURE_PUBLIQUE), packs: PACKS, custom: CUSTOM, paiement: !!env.STRIPE_SECRET });
  }
  if (chemin === '/photo' && methode === 'GET') return imagePhoto(cl.photo);
  // en aperçu, l'admin voit tout mais ne change rien à la place du client
  if (methode !== 'GET' && apercu) return json({ erreur: 'Aperçu : rien n\'est enregistré à la place du client.' }, 403);

  // son profil
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
    if (!env.STRIPE_SECRET) return json({ erreur: 'Le paiement en ligne arrive bientôt. Écrivez-nous sur WhatsApp pour commander.' }, 503);
    const b = await corpsJson(req);
    const d = devis(String(b.pack || ''), b.formule, b.nb_creas, Array.isArray(b.options) ? b.options.map(String) : []);
    const meta = { kreative_client: cl.id, pack: d.pack, formule: d.formule, nb_creas: String(d.nb), options: d.options.join(','), total: String(d.total) };
    const m = d.formule === 'mensuel';
    const p = {
      mode: m ? 'subscription' : 'payment', locale: 'fr', client_reference_id: cl.id, metadata: meta,
      success_url: url.origin + '/client/#/merci', cancel_url: url.origin + '/client/#/commander',
      allow_promotion_codes: 'true', billing_address_collection: 'required', tax_id_collection: { enabled: 'true' },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: String(Math.round(d.total * 100)),
        product_data: { name: d.libelle, description: 'Kreative · créatives publicitaires Meta, livrées en 1:1, 4:5 et 9:16' },
        recurring: m ? { interval: 'month' } : undefined } }]
    };
    if (cl.stripe_client) p.customer = cl.stripe_client; else p.customer_email = cl.email || undefined;
    if (m) p.subscription_data = { metadata: meta };
    else {
      p.invoice_creation = { enabled: 'true', invoice_data: { metadata: meta } };
      p.payment_intent_data = { metadata: meta };
      if (!cl.stripe_client) p.customer_creation = 'always';
    }
    try {
      const s = await appelStripe(env, 'checkout/sessions', p);
      await noter(db, cl.id, null, 'paiement', 'Paiement ouvert · ' + d.libelle + ' · ' + d.total + ' €');
      return json({ url: s.url, total: d.total });
    } catch (e) { return json({ erreur: 'Stripe : ' + e.message }, 502); }
  }

  // valider la livraison, puis l'avis Trustpilot
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9]+)\/(valider|avis)$/)) && methode === 'POST') {
    const k = await db.prepare('SELECT * FROM commandes WHERE id = ? AND client_id = ?').bind(m[1], cl.id).first();
    if (!k) return json({ erreur: 'Commande introuvable' }, 404);
    if (m[2] === 'valider') {
      if (!['livre', 'revisions'].includes(k.statut)) return json({ erreur: 'Cette commande ne peut pas encore être validée.' }, 409);
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
    const max = await db.prepare('SELECT MAX(CAST(substr(ref, 3) AS INTEGER)) AS n FROM commandes').first();
    ref = 'K-' + String(Math.max(100, (max && max.n) || 100) + 1 + essai);
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

  if (chemin === '/clients' && methode === 'GET') {
    await synchroStatuts(db);
    const { results } = await db.prepare(`SELECT c.*, COUNT(k.id) AS nb_commandes, COALESCE(SUM(k.prix),0) AS total,
      MAX(k.cree_le) AS derniere_commande, SUM(CASE WHEN k.statut IN ('brief','production','livre','revisions') THEN 1 ELSE 0 END) AS en_cours
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
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9]+)\/photo$/)) && methode === 'GET') {
    const cl = await db.prepare('SELECT photo FROM clients WHERE id = ?').bind(m[1]).first();
    return imagePhoto(cl && cl.photo);
  }
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9]+)$/))) {
    const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    if (methode === 'GET') {
      const commandes = await commandesDuClient(db, env, cl.id, true);
      const [{ results: activite }, { results: factures }] = await Promise.all([
        db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 30').bind(cl.id).all(),
        db.prepare('SELECT * FROM factures WHERE client_id = ? ORDER BY emise_le DESC').bind(cl.id).all()]);
      const { photo, ...sansPhoto } = cl;
      return json({ client: { ...sansPhoto, lien: lienAcces(url, cl.jeton) }, commandes, activite, factures });
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
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9]+)\/(nouveau-lien|envoyer-lien)$/)) && methode === 'POST') {
    const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    if (m[2] === 'nouveau-lien') {
      const jeton = aleatoire(32);
      await db.prepare('UPDATE clients SET jeton = ? WHERE id = ?').bind(jeton, cl.id).run();
      await noter(db, cl.id, null, 'lien', 'Nouveau lien d\'accès (l\'ancien ne marche plus)');
      return json({ lien: lienAcces(url, jeton) });
    }
    if (!cl.email) return json({ erreur: 'Ce client n\'a pas d\'email.' }, 400);
    const r = await envoyerEmail(env, { type: 'acces', a: cl.email, marque: cl.marque, contact: cl.contact || '', lien: lienAcces(url, cl.jeton) });
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
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9]+)$/))) {
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
  if ((m = chemin.match(/^\/factures\/(f_[A-Za-z0-9]+)$/))) {
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
      if (f.source === 'stripe') return json({ erreur: 'Une facture Stripe se gère dans Stripe.' }, 409);
      await db.prepare('DELETE FROM factures WHERE id = ?').bind(f.id).run();
      return json({ ok: true });
    }
  }

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
      (SELECT COUNT(*) FROM factures WHERE statut IN ('ouverte','impayee')) AS impayees`).bind(maintenant() - 30 * 864e5, maintenant() - 30 * 864e5).first();
    return json({ ...r, packs: PACKS, custom: CUSTOM, stripe: !!env.STRIPE_WEBHOOK_SECRET, paiement: !!env.STRIPE_SECRET });
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
//  Un paiement réussi crée la commande (et l'espace client si besoin) ;
//  chaque mois d'abonnement payé crée la commande du mois suivant.
//  La facture est rattachée au client par son email, et à une commande
//  si la facture porte la métadonnée « commande » (ex. K-104).
// ============================================================
// un paiement Stripe réussi : la commande se crée seule (et l'espace client
// aussi si c'est un nouveau client, avec son lien d'accès par email)
async function paiementRecu(env, ctx, url, s) {
  const db = await base(env);
  if (await db.prepare('SELECT id FROM commandes WHERE stripe_session = ?').bind(s.id).first()) return;     // déjà traité
  const meta = s.metadata || {};
  const email = String((s.customer_details && s.customer_details.email) || s.customer_email || '').toLowerCase();
  let cl = meta.kreative_client ? await db.prepare('SELECT * FROM clients WHERE id = ?').bind(String(meta.kreative_client)).first() : null;
  if (!cl && s.customer) cl = await db.prepare('SELECT * FROM clients WHERE stripe_client = ?').bind(String(s.customer)).first();
  if (!cl && email) cl = await db.prepare('SELECT * FROM clients WHERE lower(email) = ?').bind(email).first();
  let nouveau = false;
  if (!cl) {
    if (!emailValide(email)) return;
    const det = s.customer_details || {};
    const id = 'c_' + aleatoire(10), jeton = aleatoire(32);
    const marque = propre((det.business_name || det.name || email.split('@')[0]), 80);
    await db.prepare('INSERT INTO clients (id, marque, contact, email, telephone, jeton, cree_le) VALUES (?,?,?,?,?,?,?)')
      .bind(id, marque, propre(det.name, 80), email, propre(det.phone, 40), jeton, maintenant()).run();
    await noter(db, id, null, 'client', 'Espace client créé');
    cl = { id, marque, contact: det.name || '', email, jeton };
    nouveau = true;
  }
  if (s.customer && !cl.stripe_client) await db.prepare('UPDATE clients SET stripe_client = ? WHERE id = ?').bind(String(s.customer), cl.id).run();
  // le pack : dans les métadonnées (portail), sinon déduit du montant (liens du site)
  const total = (s.amount_total || 0) / 100, mensuel = s.mode === 'subscription';
  let pack = PACKS[meta.pack] ? meta.pack : null;
  if (!pack) pack = Object.keys(PACKS).find(k => PACKS[k][mensuel ? 'mensuel' : 'unique'] === total) || 'custom';
  const nb = Number(meta.nb_creas) || PACKS[pack].creas;
  const r = await creerCommande(db, { client_id: cl.id, pack, formule: mensuel ? 'mensuel' : 'unique', nb, prix: total,
    options: meta.options ? String(meta.options).split(',').filter(Boolean) : [], stripe_session: s.id,
    stripe_abo: typeof s.subscription === 'string' ? s.subscription : null, stripe_facture: typeof s.invoice === 'string' ? s.invoice : null,
    texte: 'Paiement reçu, commande confirmée' });
  if (typeof s.invoice === 'string') await db.prepare('UPDATE factures SET commande_id = COALESCE(commande_id, ?), client_id = COALESCE(client_id, ?) WHERE stripe_id = ?').bind(r.id, cl.id, s.invoice).run();
  if (nouveau && cl.jeton) {
    const envoi = envoyerEmail(env, { type: 'acces', a: email, marque: cl.marque, contact: cl.contact || '', lien: lienAcces(url, cl.jeton) });
    if (ctx && ctx.waitUntil) ctx.waitUntil(envoi); else await envoi;
  }
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
  } else if (/^invoice\./.test(ev.type || '')) await enregistrerFacture(env, o);
  return json({ recu: true });
}
async function enregistrerFacture(env, inv) {
  if (!inv.id || inv.status === 'draft') return;
  const db = await base(env);
  const email = String(inv.customer_email || '').toLowerCase();
  const sd = inv.subscription_details || (inv.parent && inv.parent.subscription_details) || {};
  const abo = (typeof inv.subscription === 'string' && inv.subscription) || sd.subscription || null;
  const meta = Object.assign({}, sd.metadata, inv.metadata);
  let cl = meta.kreative_client ? await db.prepare('SELECT id FROM clients WHERE id = ?').bind(String(meta.kreative_client)).first() : null;
  if (!cl && inv.customer) cl = await db.prepare('SELECT id FROM clients WHERE stripe_client = ?').bind(String(inv.customer)).first();
  if (!cl && email) cl = await db.prepare('SELECT id FROM clients WHERE lower(email) = ?').bind(email).first();
  let k = meta.commande ? await db.prepare('SELECT id, client_id FROM commandes WHERE ref = ?').bind(String(meta.commande)).first() : null;
  if (!k) k = await db.prepare('SELECT id, client_id FROM commandes WHERE stripe_facture = ?').bind(inv.id).first();
  if (!k && abo) {
    const derniere = await db.prepare('SELECT * FROM commandes WHERE stripe_abo = ? ORDER BY cree_le DESC LIMIT 1').bind(abo).first();
    if (derniere && inv.billing_reason === 'subscription_cycle' && inv.status === 'paid') {
      // un nouveau mois d'abonnement : une nouvelle commande, avec son propre brief
      const r = await creerCommande(db, { client_id: derniere.client_id, pack: derniere.pack, formule: 'mensuel', nb: derniere.nb_creas,
        prix: (inv.total || 0) / 100, options: derniere.options ? derniere.options.split(',') : [], stripe_abo: abo, stripe_facture: inv.id, texte: 'Nouveau mois d\'abonnement' });
      k = { id: r.id, client_id: derniere.client_id };
    } else if (derniere && !derniere.stripe_facture) k = { id: derniere.id, client_id: derniere.client_id };
  }
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

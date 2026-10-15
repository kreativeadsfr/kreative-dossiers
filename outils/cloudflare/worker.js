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

  const r = await lireGithub(fichier, env, 'GET');
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
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_cmd_client ON commandes(client_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS i_act_client ON activite(client_id, le)`)
    ]);
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
async function lireJsonDepot(env, chemin) {
  try { const r = await lireGithub(chemin, env, 'GET'); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function avancement(env, cmd) {
  const e = { brief: !!cmd.dossier || !!cmd.brief_le, strategie: false, creation: false, livre: ['livre', 'revisions', 'valide'].includes(cmd.statut),
    valide: cmd.statut === 'valide', revisions: cmd.statut === 'revisions' };
  let d = null;
  if (cmd.dossier) {
    const [donnees, envois, liv] = await Promise.all(['donnees', 'envois', 'livraison'].map(f => lireJsonDepot(env, cmd.dossier + '/' + f + '.json')));
    d = donnees;
    e.strategie = !!(envois && Array.isArray(envois.envois) && envois.envois.length) || e.livre;
    e.creation = !!(liv && liv.livre) || e.livre;
  }
  const etapes = [
    { cle: 'commande', titre: 'Commande confirmée', fait: true },
    { cle: 'brief', titre: 'Brief envoyé', fait: e.brief },
    { cle: 'strategie', titre: 'Angles et copywriting', fait: e.strategie },
    { cle: 'creation', titre: 'Création des visuels', fait: e.creation },
    { cle: 'livraison', titre: 'Livraison de vos créatives', fait: e.livre },
    { cle: 'validation', titre: 'Validation', fait: e.valide }
  ];
  const faites = etapes.filter(x => x.fait).length;
  const enCours = etapes.find(x => !x.fait);
  return { etapes, progression: Math.round(faites * 100 / etapes.length), en_cours: enCours ? enCours.cle : null,
    deadline: cmd.deadline || (d && Date.parse(d.deadline)) || null, marque_dossier: d && d.brand_name };
}

async function commandesDuClient(db, env, id, detail) {
  const { results } = await db.prepare('SELECT * FROM commandes WHERE client_id = ? AND statut != ? ORDER BY cree_le DESC').bind(id, 'annule').all();
  if (!detail) return results;
  return Promise.all(results.map(async c => ({ ...c, ...(await avancement(env, c)) })));
}

// ---------- API du client ----------
async function apiClient(req, env, ctx, url, chemin, methode, cl, apercu) {
  const db = await base(env);
  if (chemin === '/moi' && methode === 'GET') {
    const commandes = await commandesDuClient(db, env, cl.id, true);
    const { results: activite } = await db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 12').bind(cl.id).all();
    if (!apercu) ctx.waitUntil(db.prepare('UPDATE clients SET vu_le = ? WHERE id = ?').bind(maintenant(), cl.id).run());
    return json({ apercu, client: { id: cl.id, marque: cl.marque, contact: cl.contact, email: cl.email, site: cl.site, cree_le: cl.cree_le },
      commandes, activite, packs: PACKS });
  }
  return json({ erreur: 'Introuvable' }, 404);
}

// ---------- API admin ----------
async function apiAdmin(req, env, ctx, url, chemin, methode) {
  const db = await base(env);
  const b = methode === 'GET' ? {} : await corpsJson(req);
  let m;

  if (chemin === '/clients' && methode === 'GET') {
    const { results } = await db.prepare(`SELECT c.*, COUNT(k.id) AS nb_commandes, COALESCE(SUM(k.prix),0) AS total,
      MAX(k.cree_le) AS derniere_commande FROM clients c LEFT JOIN commandes k ON k.client_id = c.id AND k.statut != 'annule'
      GROUP BY c.id ORDER BY c.cree_le DESC`).all();
    return json(results.map(c => ({ ...c, lien: lienAcces(url, c.jeton) })));
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
  if ((m = chemin.match(/^\/clients\/(c_[A-Za-z0-9]+)$/))) {
    const cl = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    if (methode === 'GET') {
      const commandes = await commandesDuClient(db, env, cl.id, true);
      const { results: activite } = await db.prepare('SELECT type, texte, le FROM activite WHERE client_id = ? ORDER BY le DESC LIMIT 30').bind(cl.id).all();
      return json({ client: { ...cl, lien: lienAcces(url, cl.jeton) }, commandes, activite });
    }
    if (methode === 'PATCH') {
      const champs = ['marque', 'contact', 'email', 'telephone', 'site', 'statut', 'notes'].filter(k => k in b);
      if (!champs.length) return json({ ok: true });
      if ('email' in b && b.email && !emailValide(propre(b.email))) return json({ erreur: 'Adresse email invalide.' }, 400);
      await db.prepare('UPDATE clients SET ' + champs.map(k => k + ' = ?').join(', ') + ' WHERE id = ?')
        .bind(...champs.map(k => k === 'email' ? (propre(b[k], 160).toLowerCase() || null) : propre(b[k], k === 'notes' ? 2000 : 160)), cl.id).run();
      return json({ ok: true });
    }
    if (methode === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM commandes WHERE client_id = ?').bind(cl.id), db.prepare('DELETE FROM activite WHERE client_id = ?').bind(cl.id),
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
    const { results } = await db.prepare(`SELECT k.*, c.marque, c.contact FROM commandes k JOIN clients c ON c.id = k.client_id
      ORDER BY k.cree_le DESC`).all();
    return json(results);
  }
  if (chemin === '/commandes' && methode === 'POST') {
    const cl = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(propre(b.client_id, 40)).first();
    if (!cl) return json({ erreur: 'Client introuvable' }, 404);
    const pack = PACKS[b.pack] ? b.pack : 'growth', formule = ['unique', 'mensuel', 'custom'].includes(b.formule) ? b.formule : 'unique';
    const P = PACKS[pack];
    const max = await db.prepare('SELECT MAX(CAST(substr(ref, 3) AS INTEGER)) AS n FROM commandes').first();
    const ref = 'K-' + String(Math.max(100, (max && max.n) || 100) + 1);
    const id = 'k_' + aleatoire(10);
    const nb = Number(b.nb_creas) || P.creas, prix = b.prix != null && b.prix !== '' ? Number(b.prix) : (formule === 'mensuel' ? P.mensuel : P.unique);
    await db.prepare('INSERT INTO commandes (id, ref, client_id, pack, formule, nb_creas, prix, dossier, statut, cree_le) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, ref, cl.id, pack, formule, nb, Number.isFinite(prix) ? prix : null, propre(b.dossier, 60) || null, b.dossier ? 'production' : 'brief', maintenant()).run();
    await noter(db, cl.id, id, 'commande', 'Commande #' + ref + ' · Pack ' + P.nom + ' · ' + nb + ' créatives');
    return json({ id, ref });
  }
  if ((m = chemin.match(/^\/commandes\/(k_[A-Za-z0-9]+)$/))) {
    const k = await db.prepare('SELECT * FROM commandes WHERE id = ?').bind(m[1]).first();
    if (!k) return json({ erreur: 'Commande introuvable' }, 404);
    if (methode === 'PATCH') {
      const champs = ['pack', 'formule', 'nb_creas', 'prix', 'dossier', 'statut', 'deadline', 'notes'].filter(x => x in b);
      if ('statut' in b && !STATUTS.includes(b.statut)) return json({ erreur: 'Statut inconnu' }, 400);
      if (!champs.length) return json({ ok: true });
      const val = x => ['nb_creas', 'prix', 'deadline'].includes(x) ? (b[x] === '' || b[x] == null ? null : Number(b[x])) : (propre(b[x], 2000) || null);
      await db.prepare('UPDATE commandes SET ' + champs.map(x => x + ' = ?').join(', ') + ' WHERE id = ?').bind(...champs.map(val), k.id).run();
      if ('dossier' in b && b.dossier && !k.dossier) {
        await db.prepare("UPDATE commandes SET brief_le = COALESCE(brief_le, ?), statut = CASE WHEN statut = 'brief' THEN 'production' ELSE statut END WHERE id = ?").bind(maintenant(), k.id).run();
        await noter(db, k.client_id, k.id, 'brief', 'Brief reçu, production lancée');
      }
      if ('statut' in b && b.statut !== k.statut) {
        const textes = { livre: 'Vos créatives sont livrées', revisions: 'Révisions en cours', valide: 'Projet validé', production: 'Production en cours' };
        if (textes[b.statut]) await noter(db, k.client_id, k.id, b.statut, textes[b.statut] + ' · #' + k.ref);
        if (b.statut === 'livre') await db.prepare('UPDATE commandes SET livre_le = ? WHERE id = ?').bind(maintenant(), k.id).run();
      }
      return json({ ok: true });
    }
    if (methode === 'DELETE') {
      await db.prepare('DELETE FROM commandes WHERE id = ?').bind(k.id).run();
      return json({ ok: true });
    }
  }
  if (chemin === '/equipe' && methode === 'GET') {
    return json(personnes(env).map(x => ({ nom: x.nom, role: x.role, espace: ACCUEILS[x.role] })));
  }
  if (chemin === '/resume' && methode === 'GET') {
    const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM clients) AS clients,
      (SELECT COUNT(*) FROM commandes WHERE statut IN ('brief','production','livre','revisions')) AS en_cours,
      (SELECT COUNT(*) FROM commandes WHERE formule = 'mensuel' AND statut != 'annule') AS mensuels,
      (SELECT COALESCE(SUM(prix),0) FROM commandes WHERE statut != 'annule' AND cree_le > ?) AS ca_30j`).bind(maintenant() - 30 * 864e5).first();
    return json({ ...r, packs: PACKS });
  }
  return json({ erreur: 'Introuvable' }, 404);
}

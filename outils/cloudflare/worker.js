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
const PUBLICS = /^\/(ui\/kreative\.css|ui\/logo-[a-z0-9-]+\.png|favicon-\d+\.png)$/;
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
  if (chemin === '/_deconnexion') return new Response(null, { status: 303, headers: {
    'Location': '/_connexion', 'Set-Cookie': COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });

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
  if (/^\/(admin|_admin)(\/|$)/.test(chemin)) return false;
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
  if (/^text\/html/.test(type)) return reecrireHtml(new Response(r.body, { status: 200, headers: entetes }), base, barre(o.qui, '/' + chemin));
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

// la petite barre en bas à gauche de chaque page : revenir en arrière,
// retourner à son espace (et, pour l'admin, aller partout)
function barre(qui, chemin) {
  if (!qui) return '';
  const accueil = ACCUEILS[qui.role];
  if (chemin === accueil || chemin === accueil + 'index.html') return '';
  const en = qui.role === 'designer';
  const liens = qui.role === 'admin'
    ? [['/admin/', 'Tableau de bord'], ['/strategiste/', 'Stratégiste'], ['/designer/', 'Designer'], ['/fiche/', 'Fiche']]
    : [[accueil, en ? 'My projects' : 'Mes projets']];
  return '<nav id="k-barre" style="position:fixed;left:16px;bottom:16px;z-index:2147483000;display:flex;gap:4px;align-items:center;' +
    'background:#1f1f1f;padding:5px;border-radius:999px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:500 13.5px/1 Inter,-apple-system,Segoe UI,sans-serif">' +
    '<style>#k-barre a,#k-barre button{all:unset;cursor:pointer;color:#fff;padding:9px 14px;border-radius:999px;white-space:nowrap}' +
    '#k-barre a:hover,#k-barre button:hover{background:#4d94ff}#k-barre .k-cur{background:rgba(255,255,255,.14)}' +
    '@media print{#k-barre{display:none}}@media(max-width:600px){#k-barre .k-opt{display:none}}</style>' +
    '<button type="button" onclick="history.length>1?history.back():location.assign(\'' + accueil + '\')" title="' + (en ? 'Back' : 'Retour') + '">← ' + (en ? 'Back' : 'Retour') + '</button>' +
    liens.map(([h, t], i) => '<a href="' + h + '"' + (i > 0 ? ' class="k-opt' + (chemin.startsWith(h) ? ' k-cur' : '') + '"' : (chemin.startsWith(h) ? ' class="k-cur"' : '')) + '>' + t + '</a>').join('') +
    '</nav>';
}

function reecrireHtml(rep, base, barreHtml) {
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
  if (barreHtml) rw = rw.on('body', { element(el) { el.append(barreHtml, { html: true }); } });
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
    ? { titre: 'Sign in', sous: 'Enter the password Kreative gave you.', mdp: 'Password', bouton: 'Sign in', err: 'Wrong password. Please try again.' }
    : { titre: 'Connexion', sous: 'Entre le mot de passe que Kreative t\'a donné.', mdp: 'Mot de passe', bouton: 'Entrer', err: 'Mot de passe incorrect. Réessaie.' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!DOCTYPE html><html lang="${en ? 'en' : 'fr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kreative</title><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
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

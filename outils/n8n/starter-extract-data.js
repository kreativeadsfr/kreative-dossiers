// ============================================================
//  EXTRACT DATA — Kreative · PACK STARTER
//  Lit chaque question par son libellé, jamais par son ID Fillout.
//  Formulaire conditionnel : une question non posée est absente
//  ou vide, on ne l'écrit pas dans le brief.
//  04/11 : le nombre de créas du lien (?creas=5) passe avant tout :
//  un projet vendu à part avec moins de 6 créas (ex. 5) garde son
//  nombre jusqu'à la fiche et à la designer. Sans ?creas, rien ne change.
// ============================================================

// Filet de sécurité si le formulaire ne porte pas le volume
const PACK_DEFAUT = 'starter';                  // starter | growth | scale
const VOLUMES = { starter: 6, growth: 12, scale: 24 };

const sub = $('Webhook').first().json.body.submission || {};
const questions = sub.questions || [];

const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const estVide = v => v === null || v === undefined ||
  (Array.isArray(v) && v.length === 0) ||
  v.toString().trim() === '';

const estFichier = v => Array.isArray(v) && v.length > 0 &&
  v.every(x => x && typeof x === 'object' && x.url);

const estLien = v => typeof v === 'string' && /^https?:\/\//.test(v.trim());

// réponse vide de sens : un slash, un tiret, un point
const estBruit = t => /^[\/\\\-–—.,;:]{1,2}$/.test(t.trim());

const fmt = v => {
  if (Array.isArray(v)) return v.map(x => (x && x.label) ? x.label : x).join(', ');
  return v.toString().trim();
};

const PERSO = /(nom et prenom|votre nom|prenom|e-?mail|email|telephone|numero de tel)/;

// questions de branchement du formulaire : elles n'apportent aucune information
const BRANCHEMENT = /^avez-vous (un site web|des couleurs principales|une police specifique|une identite visuelle|des exemples de creatives|des photos lifestyle|une charte graphique)/;

const RE = {
  brand:   /nom de votre entreprise|nom de l entreprise|nom de la marque/,
  sector:  /secteur/,
  website: /url de votre site|adresse de votre site/,
  volume:  /nombre de creatives|nombre de creas/,
  style:   /quel style de creas/,
  classiq: /^ads classiques$/,
  ugly:    /^ugly ads$/
};

let brand_name = '', sector = '', website = '';
let pack = '', nb_creas = 0, pct_classiques = null, pct_ugly = null;
const briefParts = [];
const liens_a_verifier = [];
const assets = { logo: [], produit: [], ambiance: [], inspiration: [], autre: [] };

// 04/11 : le nombre de créas du lien (champ caché « creas » du formulaire)
let creasLien = 0;
for (const p of (Array.isArray(sub.urlParameters) ? sub.urlParameters : [])) {
  if (/^creas?$/i.test(String(p.name || p.id || '').trim())) {
    const m = String(p.value || '').match(/(\d+)/);
    if (m) creasLien = parseInt(m[1], 10);
  }
}

for (const q of questions) {
  const label = (q.name || '').toString().trim();
  const n = norm(label);
  const val = q.value;
  if (/^(comment avez-vous compris|comment nous avez-vous decouvert|quel contenu vous a le plus marque|quelles etaient vos plus grosses hesitations|combien de temps vous a-t-il fallu|qu.est-ce qui vous a finalement fait choisir|qu.avez-vous pense de ce formulaire)/.test(n)) continue; // 02/11 : page « Informations complémentaires » (sondage Kreative), jamais en production

  // 1) fichiers — jamais dans le corps du brief
  if (estFichier(val)) {
    const urls = val.map(x => x.url);
    if (/logo/.test(n)) assets.logo.push(...urls);
    else if (/creatives que vous aimez|inspiration|reference/.test(n)) assets.inspiration.push(...urls);
    else if (/lifestyle|ambiance/.test(n)) assets.ambiance.push(...urls);
    else if (/produit|product|packaging/.test(n)) assets.produit.push(...urls);
    else assets.autre.push(...urls);
    continue;
  }

  // 2) question non posée, réponse vide ou sans contenu
  if (estVide(val)) continue;
  const texte = fmt(val);
  if (estBruit(texte)) continue;

  // 3) champs pilotes — captés puis retirés du brief
  if (RE.brand.test(n))        { brand_name = texte; continue; }
  if (RE.sector.test(n))       { sector = texte;     continue; }
  if (RE.website.test(n))      { website = texte;    continue; }

  if (RE.volume.test(n)) {
    const m = texte.match(/(\d+)/);
    nb_creas = m ? parseInt(m[1], 10) : 0;
    pack = nb_creas <= 6 ? 'starter' : nb_creas <= 12 ? 'growth' : 'scale';
    continue;
  }

  // style demandé : lu ici, puis écrasé par les curseurs s'ils existent
  if (RE.style.test(n)) {
    const t = norm(texte);
    if (/les deux/.test(t))      { pct_classiques = 50;  pct_ugly = 50; }
    else if (/ugly/.test(t))     { pct_classiques = 0;   pct_ugly = 100; }
    else                         { pct_classiques = 100; pct_ugly = 0; }
    continue;
  }

  if (RE.classiq.test(n)) { pct_classiques = parseInt(texte, 10); continue; }
  if (RE.ugly.test(n))    { pct_ugly = parseInt(texte, 10);       continue; }

  // 4) réponse qui n'est qu'un lien — à récupérer à la main
  if (estLien(texte)) {
    liens_a_verifier.push({ question: label, lien: texte });
    continue;
  }

  // 5) corps du brief
  if (PERSO.test(n)) continue;
  if (BRANCHEMENT.test(n)) continue;
  if (!label) continue;
  briefParts.push('**' + label + '**\n' + texte);
}

// 04/11 : le nombre du lien passe avant la question et avant le repli
if (creasLien > 0 && creasLien <= 100) {
  nb_creas = creasLien;
  pack = nb_creas <= 6 ? 'starter' : nb_creas <= 12 ? 'growth' : 'scale';
}

// repli si le formulaire ne portait pas le volume
if (!nb_creas) { pack = PACK_DEFAUT; nb_creas = VOLUMES[PACK_DEFAUT]; }

// répartition classiques / ugly
if (pct_ugly === null && pct_classiques === null) { pct_classiques = 100; pct_ugly = 0; }
else if (pct_ugly === null) pct_ugly = 100 - pct_classiques;
else if (pct_classiques === null) pct_classiques = 100 - pct_ugly;

const nb_ugly = Math.round(nb_creas * pct_ugly / 100);

// identifiant projet, sert de nom de dossier GitHub
const slug = (brand_name || 'CLIENT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
const mois = String(new Date().getMonth() + 1).padStart(2, '0');
const dossier = slug + '_' + mois + '_' + Math.random().toString(16).slice(2, 6);

const famille = /e-?commerce|produit|boutique|shop/.test(norm(sector)) ? 'ecommerce' : 'agence';

// tous les visuels du client, à plat, avec un identifiant
let k = 0;
const listeAssets = [];
for (const [type, urls] of Object.entries(assets))
  for (const url of urls)
    listeAssets.push({ id: 'PJ' + String(++k).padStart(2, '0'), url, type });

return [{
  json: {
    pack, nb_creas,
    pct_classiques, pct_ugly, nb_ugly,
    dossier, famille,
    brand_name: brand_name || 'Client',
    sector, website,
    brief_clean: briefParts.join('\n\n'),
    assets: listeAssets,
    liens_a_verifier
  }
}];

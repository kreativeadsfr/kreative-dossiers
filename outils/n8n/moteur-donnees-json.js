// ============================================================
//  DONNEES JSON
//  Rassemble tout ce dont le workflow 2 aura besoin pour ecrire
//  les prompts : la DA du client, ses assets, son ton, ses
//  interdits. La fiche creas, elle, n'en lit que deux champs :
//  brand_name et nb_creas.
//
//  Se place apres "Assembler la page", avant la publication.
// ============================================================

// Ce nœud est placé APRÈS la publication de la page, donc l'item qui
// arrive est la réponse de l'API GitHub, pas le projet. On va donc
// chercher le projet à la source, dans le premier nœud en amont qui
// le porte vraiment, par index de branche et d'exécution.
const projet = (() => {
  const complet = ['Visuels du site', 'Retenir les concurrents',
                   'Trier les pubs', 'Compacter le site'];
  for (const n of complet) {
    try { const v = $(n).first(0, 0).json; if (v && v.dossier && v.brief_clean) return v; }
    catch (e) { /* nœud absent */ }
  }
  for (const n of complet.concat(['Assembler la page'])) {
    try { const v = $(n).first(0, 0).json; if (v && v.dossier) return v; }
    catch (e) { /* nœud absent */ }
  }
  return $input.first().json;
})();

const d = projet;

//  La page du dossier doit etre en ligne avant d aller plus loin.
//  « Publier la page » continue en cas d erreur : sans ce controle,
//  le stratégiste recevait un lien en 404 (CHEVREL LILIAN, 07/10).
//  On arrete donc ici : le workflow « Kreative · Alertes de panne »
//  previent Kreative, et aucun lien mort ne part.
let pagePubliee = null;
try { pagePubliee = $('Publier la page').first(0, 0).json; } catch (e) { pagePubliee = null; }
if (pagePubliee && pagePubliee.error) {
  const m = typeof pagePubliee.error === 'string' ? pagePubliee.error : (pagePubliee.error.message || JSON.stringify(pagePubliee.error));
  throw new Error('La page du dossier ' + (d.dossier || '') + ' n a pas pu etre publiee sur GitHub : ' + String(m).slice(0, 200));
}

// ------------------------------------------------------------
//  LES DELAIS, tous comptes depuis la commande du client.
//    48 h (6 et 12 creas) ou 72 h (24 creas, pack scale)
//    strategiste : un tiers du delai     -> 16 h ou 24 h
//    designer    : jusqu a 8 h avant la livraison client
//    marge       : 8 h de controle et de modifs, toujours
//  Chaque echeance est une DATE FIXE : si le strategiste rend en
//  avance ou en retard, celle du designer ne bouge pas.
// ------------------------------------------------------------
const H = 3600000;
const COMMANDE = Date.now();
const HEURES = /scale/i.test(String(d.pack || '')) ? 72 : 48;
const MARGE = 8;
const enClair = (ms) => new Date(ms).toLocaleString('fr-FR', {
  weekday: 'long', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris'
});

const norm = (t) => (t || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const source = (noeud, champ, repli) => {
  for (const lire of [
    () => $(noeud).first(0, 0).json[champ],
    () => $(noeud).first().json[champ]
  ]) {
    try { const v = lire(); if (v !== undefined && v !== null) return v; }
    catch (e) { /* noeud non execute */ }
  }
  return repli;
};

// ---------- relire le brief ----------
const brief = String(source('Assembler la page', 'brief_clean', d.brief_clean) || '');
const paires = [];
for (const bloc of brief.split('\n\n**')) {
  const t = bloc.replace(/^\*\*/, '');
  const i = t.indexOf('**\n');
  if (i === -1) continue;
  paires.push({ q: t.slice(0, i).trim(), r: t.slice(i + 3).trim() });
}
const rep = (re) => {
  const p = paires.find(x => re.test(norm(x.q)));
  const r = p ? p.r.trim() : '';
  //  « Non », « Aucun », « Rien » ne sont pas des consignes
  return /^(non|aucun|aucune|rien|n\/?a|-|\.)\.?$/i.test(r) ? '' : r;
};

// ---------- couleurs et polices ----------
// Ce que le client a ecrit, puis ce que le site confirme.
const hexBrief = (rep(/couleurs principales/).match(/#[0-9a-f]{3,8}/gi) || [])
  .map(x => x.toLowerCase());

let hexSite = [];
try {
  const pages = $('Firecrawl · résultat').first(0, 0).json.data || [];
  const compte = {};
  for (const p of pages) {
    const html = String(p.html || p.rawHtml || '');
    for (const h of (html.match(/#[0-9a-f]{6}\b/gi) || [])) {
      const k = h.toLowerCase();
      // on jette le noir, le blanc et les gris purs : ils n'apprennent rien
      const r = parseInt(k.slice(1, 3), 16), g = parseInt(k.slice(3, 5), 16), b = parseInt(k.slice(5, 7), 16);
      if (Math.max(r, g, b) - Math.min(r, g, b) < 18) continue;
      compte[k] = (compte[k] || 0) + 1;
    }
  }
  hexSite = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
} catch (e) { hexSite = []; }

//  Les couleurs ECRITES par le client font foi. Celles lues sur le
//  site ne sont qu un complement : un widget ou un bandeau peut y
//  injecter des rouges qui n ont rien a voir avec la marque.
//  La DA lue par Claude sur la capture de la page d accueil (appel
//  « Claude · trier les visuels »). Elle remplace les couleurs comptees
//  dans le HTML, qui ramassaient les etoiles Google, les logos de
//  paiement et les icones. Si elle manque, on garde l ancien comptage.
let daSite = null;
try {
  const j = $('Claude · trier les visuels').first(0, 0).json || {};
  const txt = (j.content && j.content[0] && j.content[0].text) || '';
  const m = txt.match(/<da>([\s\S]*?)<\/da>/);
  if (m) {
    const brut = m[1];
    const o = JSON.parse(brut.slice(brut.indexOf('{'), brut.lastIndexOf('}') + 1));
    if (o && typeof o === 'object') daSite = o;
  }
} catch (e) { daSite = null; }
const hexOk = h => /^#[0-9a-f]{6}$/i.test(String(h || '').trim());
const hexDa = ((daSite && daSite.couleurs) || []).map(c => String((c && c.hex) || c || '').trim().toLowerCase()).filter(hexOk);

const couleurs_client = [...new Set(hexBrief)].slice(0, 6);
const couleurs_site = (hexDa.length ? hexDa : hexSite).filter(h => !couleurs_client.includes(h)).slice(0, 6);
const couleurs = [...new Set([...couleurs_client, ...couleurs_site])].slice(0, 8);

// ---------- polices (31/10) ----------
//  1. Celle(s) ECRITE(S) par le client dans le brief font foi (« Quelle est votre police ? »,
//     « Quelles sont vos polices ? »...). Un « Oui », « Non », « Aucune » n est pas une police.
//  2. Sinon, le VRAI nom lu dans le code du site : le HTML, ses <style>, et ses feuilles de style
//     (souvent la police n est declaree que la), variables CSS comprises. Plus jamais une
//     description vague (« sans-serif geometrique ») a la place d un nom.
const OUI_NON = /^(oui|non|yes|no|aucun|aucune|rien|pas de police|je ne sais pas|n\/?a|-|\.)\b[\s.!]*$/i;
const policesDuBrief = (paires, norm) => {
  const noms = [];
  for (const p of paires) {
    if (!/polic|typo|font/.test(norm(p.q))) continue;
    const r = String(p.r || '').trim();
    if (!r || OUI_NON.test(r) || /^https?:\/\//i.test(r) || r.length > 120) continue;
    for (const x of r.split(/[,;\n]|\s+et\s+|\s+\/\s+/)) {
      const n = x.replace(/^[-•*\s]+|[.\s]+$/g, '').replace(/\s*\((titres?|texte|corps|headlines?|body)[^)]*\)\s*$/i, '').trim();
      if (n && !OUI_NON.test(n) && n.length <= 40) noms.push(n);
    }
  }
  return [...new Set(noms)].slice(0, 3);
};
const POLICE_SYSTEME = /^(inherit|initial|unset|revert|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|-apple-system|blinkmacsystemfont|segoe ui|segoe ui emoji|segoe ui symbol|apple color emoji|noto color emoji|helvetica neue|helvetica|arial|times|times new roman|georgia|verdana|tahoma|courier|courier new|menlo|monaco|consolas|sfmono-regular|liberation mono|emoji|math|fangsong)$/i;
const POLICE_ICONES = /icon|awesome|fontello|glyph|material symbols|material icons|swiper|slick|dashicons|eicons|elementor|woocommerce|star|social|revicons|lucide|feather/i;
function policesDuCode(textes) {
  const vars = {};
  for (const t of textes) for (const m of t.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) vars[m[1]] = m[2].trim();
  const premiere = (valeur, prof = 0) => {
    let v = String(valeur || '').trim();
    const mv = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/);
    if (mv) {
      if (prof < 5 && vars[mv[1]]) return premiere(vars[mv[1]], prof + 1);
      return mv[2] ? premiere(mv[2], prof + 1) : '';
    }
    const morceaux = v.split(',').map(x => x.replace(/!important/i, '').replace(/["']/g, '').trim());
    //  une pile qui commence par une police systeme est celle du navigateur (Tailwind, Bootstrap...) :
    //  Roboto ou Noto Sans y sont des secours, pas la police de la marque
    if (/^(-apple-system|system-ui|blinkmacsystemfont|ui-sans-serif|ui-serif)$/i.test(morceaux[0] || '')) return '';
    for (const n of morceaux) {
      if (!n || /[&;{}()]|^\d/.test(n) || n.length < 3 || n.length > 40) continue;
      if (POLICE_SYSTEME.test(n)) continue;
      return n;
    }
    return '';
  };
  const score = {}, titres = {}, texte = {};
  const ajoute = (n, pts, sel) => {
    if (!n || POLICE_ICONES.test(n)) return;
    score[n] = (score[n] || 0) + pts;
    if (sel && /(^|[\s,>+~])(h[1-3])\b|title|titre|heading|display|hero/i.test(sel)) titres[n] = (titres[n] || 0) + 1;
    if (sel && /(^|[\s,])(:root|html|body|p)\b/i.test(sel)) texte[n] = (texte[n] || 0) + 1;
  };
  for (const t of textes) {
    for (const m of t.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&)\s]+)/gi))
      for (const f of decodeURIComponent(m[1]).split('|')) ajoute(f.split(':')[0].replace(/\+/g, ' ').trim(), 3);
    for (const m of t.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)/gi)) ajoute(premiere(m[1]), 3);
    for (const m of t.matchAll(/([^{}@]*)\{[^{}]*?font-family\s*:\s*([^;}]+)/gi)) {
      const sel = m[1].trim();
      if (/code|kbd|samp|pre\b|mono/i.test(sel)) continue;
      ajoute(premiere(m[2]), 1, sel);
    }
    for (const m of t.matchAll(/style\s*=\s*["'][^"']*font-family\s*:\s*([^;"']+)/gi)) ajoute(premiere(m[1]), 1);
  }
  const tri = o => Object.keys(o).sort((a, b) => o[b] - o[a] || score[b] - score[a]);
  const noms = tri(score);
  if (!noms.length) return { noms: [], titres: '', texte: '' };
  const titre = tri(titres)[0] || noms[0];
  const corps = tri(texte).find(n => n !== titre) || (noms.find(n => n !== titre && texte[n]) || '') || (titres[noms[0]] ? '' : '');
  return { noms: noms.slice(0, 4), titres: titre, texte: corps && corps !== titre ? corps : '' };
}
//  le code du site : les pages lues par Firecrawl, puis la page d accueil et ses feuilles de style
async function codeDuSite(helpers, pages, site) {
  const textes = pages.map(p => String(p.rawHtml || p.html || '')).filter(Boolean);
  let accueil = '';
  try {
    if (site) {
      const r = await helpers.httpRequest({ method: 'GET', url: site, timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 Kreative' } });
      accueil = typeof r === 'string' ? r : '';
      if (accueil) textes.push(accueil);
    }
  } catch (e) { /* site injoignable : on garde Firecrawl */ }
  const liens = [];
  for (const h of textes.slice(0, 3)) {
    for (const m of h.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/stylesheet/i.test(tag)) continue;
      const href = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (href) { try { liens.push(new URL(href.replace(/&amp;/g, '&'), site || 'https://exemple.fr/').href); } catch (e) {} }
    }
    for (const m of h.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/gi)) { try { liens.push(new URL(m[1], site || 'https://exemple.fr/').href); } catch (e) {} }
  }
  for (const u of [...new Set(liens)].filter(u => !/fonts\.googleapis\.com/.test(u)).slice(0, 5)) {
    try {
      const r = await helpers.httpRequest({ method: 'GET', url: u, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 Kreative' } });
      if (typeof r === 'string' && r.length < 3e6) textes.push(r);
    } catch (e) { /* feuille illisible */ }
  }
  for (const u of liens.filter(u => /fonts\.googleapis\.com/.test(u))) textes.push(u);
  return textes;
}

const policesBrief = policesDuBrief(paires, norm);
let codeSite = { noms: [], titres: '', texte: '' };
try {
  let pages = [];
  try { pages = $('Firecrawl · résultat').first(0, 0).json.data || []; } catch (e) { pages = []; }
  const site = String(d.website || rep(/url de votre site/) || '').trim();
  const url = !site ? '' : (/^https?:\/\//i.test(site) ? site : 'https://' + site);
  codeSite = policesDuCode(await codeDuSite(this.helpers, pages, url));
} catch (e) { /* le site reste muet : la lecture de la capture sert de secours */ }

//  une description (« sans-serif geometrique tres grasse ») n est pas un nom de police
const VAGUE = /sans-serif|\bserif\b|geometri|géométri|grass|regul|régul|manuscri|arrondi|condens|moderne|epur|épur|classique|elegant|élégant|^\S+\s+\S+\s+\S+\s+\S+/i;
const polices_client = [...new Set(policesBrief)].slice(0, 3);
const policesDa = [daSite && daSite.police_titres, daSite && daSite.police_texte]
  .map(p => String(p || '').trim()).filter(p => p && p.length <= 60);
const policesDaNommees = policesDa.filter(p => !VAGUE.test(p));
let polices_site = [...new Set([...codeSite.noms, ...policesDaNommees])].filter(p => !polices_client.includes(p)).slice(0, 4);
//  rien de nomme nulle part : on garde la description, mieux que rien pour le strategiste
if (!polices_client.length && !polices_site.length) polices_site = [...new Set(policesDa)].slice(0, 2);
const polices = [...new Set([...polices_client, ...polices_site])].slice(0, 6);

// ---------- captures ----------
const captures = []
  .concat(source('Assembler la page', 'captures', d.captures) || [])
  .concat(d.capture ? [{ page: 'accueil', url: d.capture }] : [])
  .concat(d.capture_url ? [{ page: 'accueil', url: d.capture_url }] : [])
  .concat((() => {
    //  les captures prises par Firecrawl sur chaque page du site
    try {
      const pages = $('Firecrawl · résultat').first(0, 0).json.data || [];
      return pages.map((p, i) => {
        const u = p.screenshot || (p.metadata && p.metadata.screenshot) || '';
        return u ? { page: (p.metadata && (p.metadata.sourceURL || p.metadata.url)) || ('page ' + (i + 1)), url: u } : null;
      }).filter(Boolean);
    } catch (e) { return []; }
  })())
  .filter(x => x && (x.url || typeof x === 'string'))
  .map(x => (typeof x === 'string' ? { page: 'accueil', url: x } : x))
  .filter((x, i, t) => t.findIndex(y => y.url === x.url) === i)
  .slice(0, 3);

//  Les liens des captures Firecrawl expirent au bout de 7 jours. On
//  range donc l image elle-meme dans donnees.json : le workflow 2 la
//  lira meme si la fiche part bien plus tard.
for (const cap of captures.slice(0, 1)) {
  try {
    const r = await this.helpers.httpRequest({ method: 'GET', url: cap.url, encoding: 'arraybuffer', returnFullResponse: true, timeout: 20000 });
    const buf = Buffer.from(r.body || r);
    const mime = (buf[0] === 0x89 && buf[1] === 0x50) ? 'image/png' : (buf[0] === 0xFF && buf[1] === 0xD8) ? 'image/jpeg'
      : (buf.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : '');
    if (mime && buf.length <= 1800000) { cap.b64 = buf.toString('base64'); cap.mime = mime; }
  } catch (e) { /* capture illisible : on garde le lien */ }
}

//  Le brand kit du designer, en anglais. Il vient de la lecture de la
//  DA ; a defaut, on le reconstruit avec les noms et les codes bruts.
//  31/10 : ses POLICES sont toujours de vrais noms : celles du brief, sinon celles du code du site.
const kitDa = daSite && daSite.brand_kit_en;
const fontsKit = polices_client.length
  ? polices_client.map((n, i, t) => ({ name: n, use: t.length === 1 ? 'headlines and body text' : i === 0 ? 'headlines' : 'body text' }))
  : codeSite.noms.length
    ? (codeSite.texte && codeSite.texte !== codeSite.titres
      ? [{ name: codeSite.titres, use: 'headlines' }, { name: codeSite.texte, use: 'body text' }]
      : [{ name: codeSite.titres || codeSite.noms[0], use: 'headlines and body text' }])
    : null;
const brand_kit = (kitDa && ((kitDa.fonts || []).length || (kitDa.colors || []).length)) ? {
  fonts: fontsKit || (kitDa.fonts || []).filter(f => f && f.name).slice(0, 4).map(f => ({ name: String(f.name), use: String(f.use || '') })),
  colors: (kitDa.colors || []).filter(c => c && hexOk(c.hex)).slice(0, 8).map(c => ({ hex: String(c.hex).toUpperCase(), name: String(c.name || '') })),
  note: String(kitDa.note || '')
} : {
  fonts: fontsKit || (polices_client.length ? polices_client : polices_site).slice(0, 3).map(n => ({ name: n, use: '' })),
  colors: (couleurs_client.length ? couleurs_client : couleurs_site).slice(0, 6).map(h => ({ hex: h.toUpperCase(), name: '' })),
  note: ''
};

// ---------- assemblage ----------
const donnees = {
  dossier: d.dossier,
  brand_name: d.brand_name,
  website: d.website || '',
  secteur: d.sector || rep(/secteur/),
  pack: d.pack,
  nb_creas: d.nb_creas,

  // ----------------------------------------------------------
  //  LA DEADLINE, fixee ICI et une seule fois.
  //  Elle part du moment ou le client a rempli son brief, pas du
  //  moment ou tel ou tel maillon travaille. Le strategiste peut
  //  mettre une demi-journee a remplir la fiche : la deadline du
  //  designer ne bouge pas pour autant, c est la meme echeance
  //  pour tout le monde. Le workflow 2 la relit dans ce fichier.
  // ----------------------------------------------------------
  deadline: new Date(COMMANDE + HEURES * H).toISOString(),
  deadline_heures: HEURES,
  //  les deux echeances internes, calculees depuis la commande
  deadline_strategiste: new Date(COMMANDE + (HEURES / 3) * H).toISOString(),
  deadline_designer: new Date(COMMANDE + (HEURES - MARGE) * H).toISOString(),
  nb_ugly: d.nb_ugly || 0,
  date: new Date().toISOString().slice(0, 10),

  couleurs,
  couleurs_client,
  couleurs_site,
  polices,
  polices_client,
  polices_site,
  captures,
  //  la DA lue sur la capture du site, et le brand kit du designer
  da_site: (daSite && daSite.description) || '',
  da_source: daSite ? 'capture du site' : 'code du site',
  brand_kit,

  ton: rep(/quel ton voulez-vous/),
  adresse: rep(/tutoiement ou (en )?vouvoiement/),
  ambiance: rep(/ambiance visuelle/),
  consignes: rep(/autre chose que nous devons savoir/),
  promo: rep(/cette promo|quelle est cette promo/),
  interdits: rep(/angles ou elements faut-il eviter|angles? creatifs? a eviter|a eviter absolument/),
  preuves: rep(/sont ces resultats/),
  offre: rep(/decrire votre offre/),
  differenciation: rep(/differencie de vos concurrents/),
  client_ideal: rep(/client ideal/),
  freins: rep(/freine vos prospects/),
  objectif: rep(/objectif principal avec ces ads/),

  assets: source('Visuels du site', 'assets', d.assets) || [],
  assets_site: source('Assembler la page', 'assets_site_retenus', d.assets_site) || [],
  pubs_client: (source('Trier les pubs', 'pubs_client', []) || []).map(p => ({ id: p.id, url: p.url, texte: p.texte })),
  pubs_concurrents: (source('Retenir les concurrents', 'pubs_concurrents', []) || []).map(p => ({ id: p.id, annonceur: p.annonceur, url: p.url, texte: p.texte }))
};

const texte = JSON.stringify(donnees, null, 2);

return [{ json: {
  ...d,
  donnees,
  deadline: donnees.deadline,
  deadline_strategiste: donnees.deadline_strategiste,
  deadline_designer: donnees.deadline_designer,
  deadline_strategiste_txt: enClair(COMMANDE + (HEURES / 3) * H),
  deadline_designer_txt: enClair(COMMANDE + (HEURES - MARGE) * H),
  deadline_client_txt: enClair(COMMANDE + HEURES * H),
  donnees_chemin: d.dossier + '/donnees.json',
  donnees_b64: Buffer.from(texte, 'utf8').toString('base64'),
  donnees_ko: Math.round(texte.length / 1024)
} }];
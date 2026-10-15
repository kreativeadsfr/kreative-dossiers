/* ============================================================
   KREATIVE · APP (partagé par le portail client et l'admin)
   Icônes, coquille (barre latérale + panneau), routeur par #,
   appels à l'API, fenêtres, toasts, thème sombre, formats.
   ============================================================ */
(function () {
  const K = window.K = {};

  // ---------- thème (clair par défaut, sombre au choix, retenu) ----------
  try { if (localStorage.getItem('k-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) {}
  K.basculerTheme = () => {
    const sombre = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = sombre ? 'dark' : 'light';
    try { localStorage.setItem('k-theme', sombre ? 'dark' : 'light'); } catch (e) {}
    K.rendre();
  };

  // ---------- icônes (traits, 24 px) ----------
  const p = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  K.i = {
    accueil: p('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    dossier: p('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    doc: p('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    panier: p('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
    message: p('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.5-.7L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5Z"/>'),
    etoile: p('<path d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8Z"/>'),
    graph: p('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gens: p('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6"/>'),
    sac: p('<path d="M6 7h12l1 13H5Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
    calques: p('<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    grille: p('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    colonnes: p('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'),
    liste: p('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    coche: p('<path d="m5 13 4 4L19 7"/>'),
    croix: p('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: p('<path d="M12 5v14M5 12h14"/>'),
    fleche: p('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    gauche: p('<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>'),
    externe: p('<path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    chercher: p('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>'),
    lune: p('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
    soleil: p('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    points: p('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>'),
    sortie: p('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'),
    lien: p('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    copier: p('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    mail: p('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    oeil: p('<path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
    horloge: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>'),
    image: p('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2.5-2.5L20 17"/>'),
    crayon: p('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/>'),
    poubelle: p('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    ampoule: p('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z"/>'),
    pinceau: p('<path d="M14 4l6 6-8 8H6v-6Z"/><path d="M4 20l2-2"/>'),
    envoi: p('<path d="M21 3 10.5 14M21 3l-7 18-3.5-7L3 10.5Z"/>'),
    bouclier: p('<path d="M12 3 5 6v6c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6Z"/>'),
    rafraichir: p('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>'),
    menu: p('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    recu: p('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    utilisateur: p('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
    carte: p('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    telecharger: p('<path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16"/>')
  };

  // ---------- petits outils ----------
  K.esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = s => document.querySelector(s);
  K.date = (ms, opt) => ms ? new Intl.DateTimeFormat('fr-FR', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }, opt || {})).format(new Date(ms)) : '·';
  K.dateHeure = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '·';
  K.jour = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '·';
  K.dans = ms => {
    if (!ms) return '';
    const h = (ms - Date.now()) / 3600000;
    if (h < 0) return 'dès que possible';
    if (h < 24) return 'dans moins de 24 h';
    const j = Math.round(h / 24); return 'dans ' + j + ' jour' + (j > 1 ? 's' : '');
  };
  K.euros = n => n == null || n === '' ? '·' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  K.ilya = ms => {
    if (!ms) return 'jamais';
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'à l\'instant'; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; if (s < 86400 * 30) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return K.date(ms);
  };
  K.initiales = t => String(t || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
  const TEINTES = ['#4d94ff', '#1f1f1f', '#e8834a', '#1e9e57', '#7c5cff', '#d6453d', '#c27a06', '#0f8b8d'];
  K.teinte = t => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TEINTES[h % TEINTES.length]; };
  K.tuile = (t, lg) => '<span class="tuile' + (lg ? ' lg' : '') + '" style="background:' + K.teinte(t) + '">' + K.esc(K.initiales(t)) + '</span>';

  // ---------- API ----------
  K.suffixe = '';   // ?client=… en aperçu admin
  K.api = async (chemin, opt) => {
    opt = opt || {};
    const r = await fetch(chemin + (chemin.includes('?') ? '&' : '?') + 't=' + Date.now() + K.suffixe.replace('?', '&'), {
      method: opt.methode || 'GET', headers: opt.corps ? { 'Content-Type': 'application/json' } : {},
      body: opt.corps ? JSON.stringify(opt.corps) : undefined, cache: 'no-store', credentials: 'same-origin' });
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((d && (d.erreur || d.message)) || ('Erreur ' + r.status)); err.statut = r.status; throw err; }
    return d;
  };
  K.lireJson = async u => { try { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };

  // ---------- toast et fenêtres ----------
  K.toast = t => {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };
  K.fenetre = (html, avecFermeture) => {
    K.fermer();
    const v = document.createElement('div'); v.className = 'voile'; v.id = 'k-fen';
    v.innerHTML = '<div class="fen" role="dialog" aria-modal="true">' + html + '</div>';
    v.addEventListener('mousedown', e => { if (e.target === v && avecFermeture !== false) K.fermer(); });
    document.body.appendChild(v);
    const f = v.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
    return v;
  };
  K.fermer = () => { const v = document.getElementById('k-fen'); if (v) v.remove(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.querySelector('.sel-pan')) K.fermerListes(); else K.fermer(); } });

  // ---------- listes déroulantes maison ----------
  // Chaque <select class="in"> est doublé d'un bouton et d'une liste stylés.
  // Le vrai select reste la source de vérité (valeur, événement change),
  // il est seulement caché : les formulaires et les onchange marchent pareil.
  const CHEVRON = '<svg class="sel-fl" viewBox="0 0 12 8" fill="none"><path d="M1 1.5 6 6.5l5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  K.fermerListes = () => { document.querySelectorAll('.sel-pan').forEach(x => x.remove()); document.querySelectorAll('.sel.ouvert').forEach(x => x.classList.remove('ouvert')); };
  K.listes = racine => {
    (racine || document).querySelectorAll('select.in:not([data-k])').forEach(sel => {
      sel.dataset.k = '1';
      const boite = document.createElement('div');
      boite.className = 'sel';
      if (sel.getAttribute('style')) { boite.setAttribute('style', sel.getAttribute('style')); sel.removeAttribute('style'); }
      sel.parentNode.insertBefore(boite, sel); boite.appendChild(sel);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'sel-btn';
      if (sel.id) btn.setAttribute('aria-labelledby', sel.id);
      boite.appendChild(btn);
      const maj = () => { const o = sel.options[sel.selectedIndex]; btn.innerHTML = '<span>' + K.esc(o ? o.text : '') + '</span>' + CHEVRON; btn.disabled = sel.disabled; };
      maj(); sel.addEventListener('change', maj); sel._kMaj = maj;
      const choisir = n => { if (n === sel.selectedIndex) { K.fermerListes(); return; } sel.selectedIndex = n; maj(); K.fermerListes(); sel.dispatchEvent(new Event('change', { bubbles: true })); };
      const ouvrir = () => {
        K.fermerListes();
        boite.classList.add('ouvert');
        const pan = document.createElement('div'); pan.className = 'sel-pan'; pan.setAttribute('role', 'listbox');
        pan.innerHTML = Array.from(sel.options).map((o, n) => '<div class="sel-opt' + (n === sel.selectedIndex ? ' on act' : '') + (o.disabled ? ' off' : '') + '" data-n="' + n + '" role="option">' +
          '<span>' + K.esc(o.text) + '</span>' + (n === sel.selectedIndex ? K.i.coche : '') + '</div>').join('');
        document.body.appendChild(pan);
        const r = btn.getBoundingClientRect(), h = Math.min(pan.scrollHeight, 300), bas = window.innerHeight - r.bottom;
        pan.style.left = r.left + 'px'; pan.style.minWidth = r.width + 'px';
        pan.style.top = (bas < h + 16 && r.top > bas ? r.top - h - 6 : r.bottom + 6) + 'px';
        const on = pan.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
        pan.addEventListener('mousedown', e => e.preventDefault());
        pan.addEventListener('click', e => { const it = e.target.closest('.sel-opt'); if (it && !it.classList.contains('off')) choisir(Number(it.dataset.n)); });
        pan.addEventListener('mousemove', e => { const it = e.target.closest('.sel-opt'); if (it) { pan.querySelectorAll('.act').forEach(x => x.classList.remove('act')); it.classList.add('act'); } });
      };
      btn.addEventListener('click', e => { e.stopPropagation(); if (boite.classList.contains('ouvert')) K.fermerListes(); else ouvrir(); });
      btn.addEventListener('keydown', e => {
        const pan = document.querySelector('.sel-pan');
        if (!pan) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); ouvrir(); } return; }
        const opts = Array.from(pan.querySelectorAll('.sel-opt:not(.off)')); let n = opts.findIndex(x => x.classList.contains('act'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (n >= 0) opts[n].classList.remove('act');
          n = Math.max(0, Math.min(opts.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))); opts[n].classList.add('act'); opts[n].scrollIntoView({ block: 'nearest' });
        }
        if ((e.key === 'Enter' || e.key === ' ') && n >= 0) { e.preventDefault(); choisir(Number(opts[n].dataset.n)); }
        if (e.key === 'Tab') K.fermerListes();
      });
    });
  };
  document.addEventListener('click', () => K.fermerListes());
  window.addEventListener('resize', () => K.fermerListes());
  document.addEventListener('scroll', e => { if (!(e.target.closest && e.target.closest('.sel-pan'))) K.fermerListes(); }, true);
  let attente = 0;
  new MutationObserver(() => { if (!attente) attente = requestAnimationFrame(() => { attente = 0; K.listes(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ---------- export CSV (s'ouvre dans Excel, Numbers, Google Sheets) ----------
  K.csv = (nom, entetes, lignes) => {
    const cel = v => { const t = v == null ? '' : String(v); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const texte = '\ufeff' + [entetes, ...lignes].map(l => l.map(cel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
    a.download = nom + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ---------- commandes : un nom lisible et un statut ----------
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const NOMS_PACKS = { starter: 'Starter', growth: 'Growth', scale: 'Scale', custom: 'Custom' };
  // « Pack Growth · octobre 2026 » ou « Abonnement Growth · novembre 2026 »
  K.nomCommande = c => {
    const d = new Date(c.cree_le || Date.now());
    return (c.formule === 'mensuel' ? 'Abonnement ' : 'Pack ') + (NOMS_PACKS[c.pack] || c.pack) + ' · ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  };
  // le statut vu par le client et par l'admin, à partir de l'état calculé par le serveur
  // l'état vient du serveur ; à défaut (ancienne version du Worker), il se déduit du statut
  K.etatCle = c => c.etat || ({ brief: 'confirmee', production: 'production' }[c.statut] || c.statut || 'production');
  K.etatCommande = c => {
    const e = K.etatCle(c);
    return ({ confirmee: ['Commande confirmée', 'a'], production: ['En production', 'b'], livre: ['Livré · à valider', 'g'], revisions: ['Retouches en cours', 'v'],
      valide: ['Validé', 'g'], annule: ['Annulée', ''] })[e] || ['En cours', 'b'];
  };
  K.pillCommande = c => { const [t, p] = K.etatCommande(c); return '<span class="pill ' + p + '"><i></i>' + K.esc(t) + '</span>'; };
  K.copier = async (t, msg) => {
    try { await navigator.clipboard.writeText(t); } catch (e) {
      const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
    }
    K.toast(msg || 'Copié');
  };
  K.confirmer = (titre, texte, bouton, danger) => new Promise(ok => {
    const v = K.fenetre('<div class="fen-h"><h2>' + K.esc(titre) + '</h2><p>' + K.esc(texte) + '</p></div>' +
      '<div class="fen-f"><button class="btn btn-s" data-n>Annuler</button><button class="btn ' + (danger ? 'btn-r' : 'btn-p') + '" data-o>' + K.esc(bouton) + '</button></div>');
    v.querySelector('[data-n]').onclick = () => { K.fermer(); ok(false); };
    v.querySelector('[data-o]').onclick = () => { K.fermer(); ok(true); };
  });

  // ---------- routeur (#/ecran/param) ----------
  K.route = () => { const h = (location.hash || '#/').slice(2).split('?')[0]; const [ecran, ...rest] = h.split('/'); return { ecran: ecran || '', params: rest }; };
  K.aller = h => { if (location.hash === h) K.rendre(); else location.hash = h; };
  window.addEventListener('hashchange', () => { K.fermerMenu(); K.rendre(); const s = document.querySelector('.scroll'); if (s) s.scrollTop = 0; });

  // ---------- coquille ----------
  // conf : { cta:{texte,href}, sections:[{titre, liens:[{id,texte,icone,href,nb,ext}]}], qui:{nom,role}, sortie, recherche:fn }
  K.coquille = (conf, actif, ariane, contenu, large) => {
    const nav = conf.sections.map(s => (s.titre ? '<div class="nav-lab">' + K.esc(s.titre) + '</div>' : '') +
      '<nav class="nav">' + s.liens.map(l => '<a href="' + K.esc(l.href) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') +
        ' class="' + (l.id === actif ? 'on' : '') + '">' + K.i[l.icone] + '<span>' + K.esc(l.texte) + '</span>' +
        (l.nb ? '<span class="nb">' + l.nb + '</span>' : '') + (l.ext ? K.i.externe.replace('<svg', '<svg class="ext"') : '') + '</a>').join('') + '</nav>').join('');
    const sombre = document.documentElement.dataset.theme === 'dark';
    return '<div class="app" id="k-app">' +
      '<aside class="side"><div class="side-logo"><img src="/ui/logo-kreative-noir.png" alt="Kreative"></div>' +
      (conf.cta ? '<a class="side-cta" href="' + K.esc(conf.cta.href) + '">' + K.esc(conf.cta.texte) + K.i.fleche.replace('<svg', '<svg width="16" height="16"') + '</a>' : '') +
      nav +
      '<div class="side-foot">' + (conf.qui.photo ? '<img class="av-img" src="' + K.esc(conf.qui.photo) + '" alt="">' : conf.qui.tuile ? K.tuile(conf.qui.nom) : '<span class="av">' + K.esc(K.initiales(conf.qui.nom)) + '</span>') +
      '<div class="qui"><b>' + K.esc(conf.qui.nom) + '</b><small>' + K.esc(conf.qui.role) + '</small></div>' +
      '<button class="menu-btn" id="k-menu-btn" aria-label="Menu">' + K.i.points + '</button>' +
      '<div class="menu" id="k-menu" hidden>' + (conf.menu || []).join('') +
      (conf.sansTheme ? '' : '<button id="k-theme2">' + (sombre ? K.i.soleil : K.i.lune) + (sombre ? 'Thème clair' : 'Thème sombre') + '</button>') +
      '<a href="' + K.esc(conf.sortie) + '">' + K.i.sortie + 'Se déconnecter</a></div></div></aside>' +
      '<div class="main"><div class="panel"><header class="top">' +
      '<button class="icon-btn burger" id="k-burger" aria-label="Menu">' + K.i.menu + '</button>' +
      '<div class="ariane">' + ariane + '</div>' +
      (conf.recherche ? '<div class="search">' + K.i.chercher + '<input id="k-cherche" placeholder="Rechercher un client, un projet, un dossier…" autocomplete="off"><kbd>⌘K</kbd><div class="res" id="k-res" hidden></div></div>' : '') +
      '<div class="top-r"><button class="icon-btn" id="k-theme" title="' + (sombre ? 'Thème clair' : 'Thème sombre') + '">' + (sombre ? K.i.soleil : K.i.lune) + '</button></div>' +
      '</header><div class="scroll"><div class="page' + (large ? ' large' : '') + '">' + contenu + '</div></div></div></div></div>';
  };
  K.brancherCoquille = conf => {
    const b = id => document.getElementById(id);
    if (b('k-theme')) b('k-theme').onclick = K.basculerTheme;
    if (b('k-theme2')) b('k-theme2').onclick = K.basculerTheme;
    if (b('k-burger')) b('k-burger').onclick = () => b('k-app').classList.toggle('menu-ouvert');
    if (b('k-menu-btn')) b('k-menu-btn').onclick = e => { e.stopPropagation(); b('k-menu').hidden = !b('k-menu').hidden; };
    document.addEventListener('click', K.fermerMenu, { once: true });
    if (conf.recherche && b('k-cherche')) {
      const champ = b('k-cherche'), res = b('k-res'); let sel = 0, items = [];
      const montrer = () => {
        items = conf.recherche(champ.value.trim()); sel = 0;
        res.hidden = !champ.value.trim();
        res.innerHTML = items.length ? items.map((x, i) => '<a href="' + K.esc(x.href) + '"' + (x.ext ? ' target="_blank" rel="noopener"' : '') + ' class="' + (i === 0 ? 'sel' : '') + '">' +
          (K.i[x.icone] || '').replace('<svg', '<svg width="15" height="15"') + '<span>' + K.esc(x.texte) + '</span><small>' + K.esc(x.type) + '</small></a>').join('')
          : '<div class="vide" style="padding:16px">Aucun résultat</div>';
      };
      champ.oninput = montrer;
      champ.onkeydown = e => {
        const liens = res.querySelectorAll('a');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!liens.length) return; liens[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + liens.length) % liens.length; liens[sel].classList.add('sel'); }
        if (e.key === 'Enter' && liens[sel]) { liens[sel].click(); res.hidden = true; champ.value = ''; }
        if (e.key === 'Escape') { res.hidden = true; champ.blur(); }
      };
      champ.onblur = () => setTimeout(() => { res.hidden = true; }, 150);
    }
  };
  K.fermerMenu = () => { const m = document.getElementById('k-menu'); if (m) m.hidden = true; const a = document.getElementById('k-app'); if (a) a.classList.remove('menu-ouvert'); };
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { const c = document.getElementById('k-cherche'); if (c) { e.preventDefault(); c.focus(); c.select(); } }
  });
  K.ariane = (icone, ...parts) => (K.i[icone] || '') + parts.map((x, i) => i === parts.length - 1 ? '<b>' + K.esc(x) + '</b>' : '<span>' + K.esc(x) + '</span><i>/</i>').join(' ');

  // ---------- étapes ----------
  // une étape « option » (l'avis) ne compte pas dans l'avancement
  K.etapes = liste => '<div class="etapes">' + liste.map((e, i) => {
    const cours = !e.fait && liste.slice(0, i).every(x => x.fait);
    const marque = e.fait ? K.i.coche : e.option ? K.i.etoile : i + 1;
    return '<div class="etape ' + (e.fait ? 'fait' : cours ? 'cours' : 'attente') + (e.option ? ' opt' : '') + '"><span class="o">' + marque + '</span>' +
      (cours ? '<span class="t"><b>' + K.esc(e.titre) + '</b>' + (e.detail ? '<small>' + K.esc(e.detail) + '</small>' : '') + '</span><span class="pill b"><i></i>' + (e.option ? 'À vous' : 'En cours') + '</span>'
        : '<span class="t">' + K.esc(e.titre) + '</span>') + '</div>';
  }).join('') + '</div>';
})();

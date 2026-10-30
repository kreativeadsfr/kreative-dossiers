/* ============================================================
   KREATIVE · APP (partagé par le portail client et l'admin)
   Icônes, coquille (barre latérale + panneau), routeur par #,
   appels à l'API, fenêtres, toasts, thème sombre, formats.
   ============================================================ */
(function () {
  const K = window.K = {};

  // ---------- démonstration : rien ne part vers n8n (ni Telegram, ni email, ni production) ----------
  // Un envoi vers l'extérieur qui concerne un projet TEST_DEMO_* reçoit une fausse réponse « ok ».
  (function () {
    const f = window.fetch;
    if (!f || f.kDemo) return;
    const g = function (entree, init) {
      try {
        const u = new URL(typeof entree === 'string' ? entree : entree.url, location.href);
        const meth = String((init && init.method) || (entree && entree.method) || 'GET').toUpperCase();
        const corps = init && typeof init.body === 'string' ? init.body : '';
        if (u.origin !== location.origin && meth !== 'GET' &&
          (/TEST_DEMO_/.test(corps) || /TEST_DEMO_/.test(location.pathname + location.search) || /\.invalid$/.test(u.hostname)))
          return Promise.resolve(new Response(JSON.stringify({ ok: true, demo: true, message: /^en/.test(document.documentElement.lang) ? 'Demo project: nothing was sent, nobody was notified.' : 'Démo : rien n\'a été envoyé, personne n\'est prévenu.' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      } catch (e) {}
      return f.apply(this, arguments);
    };
    g.kDemo = true;
    window.fetch = g;
  })();
  K.estDemo = d => /^TEST_DEMO_/.test(String(d || ''));

  // ---------- télécharger une facture ----------
  // Une facture payée : un PDF fait ici, marqué « Payée » (le PDF de Stripe d'un paiement fait sur le site garde
  // « à régler » et « Payer en ligne », car Stripe l'émet en « envoi de facture » au moment du paiement).
  // Mêmes informations que la facture Stripe : numéro, dates, Kreative, client, ligne « Pack X » et son détail, mentions.
  // Une facture pas encore payée : le PDF de Stripe s'il existe.
  // o : { client, email, commande (numéro), projet, k (la commande, pour la ligne et son détail) }
  let jspdf = null, logoPdf = null;
  const NOMS_OPT = { express: 'Livraison express', ab_visuel: 'A/B test visuel', ab_texte: 'A/B test texte' };
  const detailFacture = k => {
    if (!k) return '';
    const m = k.formule === 'mensuel', nb = k.nb_creas || 0;
    const opts = String(k.options || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const [id, q] = x.split(':'), n = Number(q) || 1;
      if (id === 'variations') return (n > 1 ? n + ' variations' : '1 variation') + ' de texte (' + (n + 1) + ' textes par visuel)';
      return NOMS_OPT[id] ? NOMS_OPT[id] + (q ? ' × ' + n : '') : '';
    }).filter(Boolean);
    return [nb + (k.pack === 'custom' ? ' créatives' : ' visuels statiques') + (m ? ' par mois' : ''), 'Livrés en 1:1, 4:5 et 9:16'].concat(opts).join(' • ');
  };
  K.telechargerFacture = async (f, o) => {
    o = o || {};
    const payee = f.statut === 'payee' || !!f.payee_le;
    if (f.pdf && !payee) { const a = document.createElement('a'); a.href = f.pdf; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; }
    try {
      if (!window.jspdf) { if (!jspdf) jspdf = new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); }); await jspdf; }
      if (logoPdf === null) logoPdf = await fetch('/ui/logo-kreative-noir.png').then(r => r.ok ? r.blob() : null).then(b => b && new Promise(ok => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = () => ok(''); l.readAsDataURL(b); })).catch(() => '') || '';
      K.facturePdf(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), f, o, logoPdf).save('Facture-' + String(f.numero || 'Kreative').replace(/[^A-Za-z0-9-]+/g, '-') + '.pdf');
    } catch (err) { K.toast('La facture n\'a pas pu se préparer.'); }
  };
  // le dessin de la facture (séparé pour le banc de test)
  K.facturePdf = (doc, f, o, logo) => {
    o = o || {};
    const e = t => String(t == null ? '' : t);
    const euros = n => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
    const jour = t => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(t));
    const payee = f.statut === 'payee' || !!f.payee_le, k = o.k || null;
    const titre = k ? (k.formule === 'mensuel' ? 'Abonnement ' : 'Pack ') + ({ starter: 'Starter', growth: 'Growth', scale: 'Scale', custom: 'Custom' }[k.pack] || k.pack) : (o.projet || 'Créatives publicitaires Kreative');
    const detail = detailFacture(k), G = 20, D = 190, gris = () => doc.setTextColor(95), noir = () => doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); noir(); doc.text('Facture', G, 30);
    if (logo) { try { doc.addImage(logo, 'PNG', D - 46, 19, 46, 46 * 372 / 1311); } catch (x) { doc.text('kreative', D, 30, { align: 'right' }); } }
    else doc.text('kreative', D, 30, { align: 'right' });
    // numéro et dates
    doc.setFontSize(10);
    const lignes = [['Numéro de facture', f.numero || ''], ['Date d\'émission', jour(f.emise_le || Date.now())]];
    if (payee) lignes.push(['Date de paiement', jour(f.payee_le || f.emise_le || Date.now())]);
    if (o.commande && o.commande !== f.numero) lignes.push(['Commande', o.commande]);
    lignes.forEach(([a, b], n) => { doc.setFont('helvetica', 'bold'); doc.text(a, G, 44 + n * 6); doc.setFont('helvetica', 'normal'); doc.text(e(b), G + 38, 44 + n * 6); });
    // Kreative et le client
    const y0 = 44 + lignes.length * 6 + 10;
    doc.setFont('helvetica', 'bold'); doc.text('Kreative', G, y0); doc.text('Facturer à', 105, y0);
    doc.setFont('helvetica', 'normal');
    ['47 Rue Vivienne', '75002 Paris', 'France', 'contact@kreativeads.fr'].forEach((t, n) => doc.text(t, G, y0 + 6 + n * 5.5));
    [o.client || f.marque || '', o.email || ''].filter(Boolean).forEach((t, n) => doc.text(e(t), 105, y0 + 6 + n * 5.5));
    // le montant, payé
    let y = y0 + 38;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(payee ? euros(f.montant) + ' payés le ' + jour(f.payee_le || f.emise_le || Date.now()) : euros(f.montant) + ' à régler', G, y);
    if (detail) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); const t = doc.splitTextToSize(detail, D - G); doc.text(t, G, y + 9); y += 9 + (t.length - 1) * 5; }
    // la ligne
    y += 16; doc.setFontSize(9); doc.setFont('helvetica', 'normal'); gris();
    doc.text('Description', G, y); doc.text('Qté', 128, y, { align: 'right' }); doc.text('Prix unitaire', 158, y, { align: 'right' }); doc.text('Montant', D, y, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(G, y + 2.5, D, y + 2.5);
    y += 9; noir(); doc.setFontSize(10.5);
    doc.text(e(titre), G, y); doc.text('1', 128, y, { align: 'right' }); doc.text(euros(f.montant), 158, y, { align: 'right' }); doc.text(euros(f.montant), D, y, { align: 'right' });
    // les totaux
    y += 12; doc.setLineWidth(0.2); doc.setDrawColor(215);
    const tot = [['Sous-total', euros(f.montant)], ['Total', euros(f.montant)], [payee ? 'Montant payé' : 'Montant dû', euros(f.montant)]];
    if (payee) tot.push(['Reste à payer', euros(0)]);
    tot.forEach(([a, b], n) => { const yy = y + n * 6.5; doc.line(118, yy - 4.5, D, yy - 4.5); doc.setFont('helvetica', n === 2 ? 'bold' : 'normal'); doc.text(a, 118, yy); doc.text(b, D, yy, { align: 'right' }); });
    // mentions
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); noir();
    doc.text('SIRET : 103 346 003 00017', G, 272); doc.text('TVA non applicable, art. 293 B du CGI', G, 277.5);
    if (f.numero) { gris(); doc.setFontSize(8.5); doc.text(e(f.numero) + ' · ' + euros(f.montant) + (payee ? ' · payée' : ''), D, 277.5, { align: 'right' }); }
    return doc;
  };

  // ---------- thème (clair par défaut, sombre au choix, retenu) ----------
  // les espaces de l'équipe restent en clair (les pages de production le sont) : <html data-clair>
  try { if (localStorage.getItem('k-theme') === 'dark' && !document.documentElement.hasAttribute('data-clair')) document.documentElement.dataset.theme = 'dark'; } catch (e) {}
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
    whatsapp: '<span class="ico-wa" aria-hidden="true"></span>',   // le logo officiel (ui/whatsapp.svg, Simple Icons, CC0)
    calendrier: p('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    chevG: p('<path d="m14.5 6-6 6 6 6"/>'),
    chevD: p('<path d="m9.5 6 6 6-6 6"/>'),
    telephone: p('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
    cloche: p('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    partager: p('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
    plusCarre: p('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>'),
    cadenas: p('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
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
    hautBas: p('<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>'),
    recu: p('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    utilisateur: p('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
    carte: p('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    telecharger: p('<path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16"/>')
  };

  // ---------- petits outils ----------
  K.esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = s => document.querySelector(s);
  K.date = (ms, opt) => ms ? new Intl.DateTimeFormat('fr-FR', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }, opt || {})).format(new Date(ms)) : '';
  K.dateHeure = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '';
  K.jour = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '';
  K.dans = ms => {
    if (!ms) return '';
    const h = (ms - Date.now()) / 3600000;
    if (h < 0) return 'dès que possible';
    if (h < 24) return 'dans moins de 24 h';
    const j = Math.round(h / 24); return 'dans ' + j + ' jour' + (j > 1 ? 's' : '');
  };
  K.euros = n => n == null || n === '' ? '0 €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  K.ilya = ms => {
    if (!ms) return 'jamais';
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'à l\'instant'; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; if (s < 86400 * 30) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return K.date(ms);
  };
  // profils de l'équipe : nom complet et photo, retrouvés par le prénom de connexion
  K.PROFILS = { dario: { nom: 'Dario Crespo', photo: '/ui/profil-dario.jpg?v=2' } };
  K.profil = (nom, defaut) => {
    const p = K.PROFILS[String(nom || '').trim().toLowerCase()];
    const n = nom ? String(nom).charAt(0).toUpperCase() + String(nom).slice(1) : defaut;
    return p ? { nom: p.nom, photo: p.photo, rond: true } : { nom: n };
  };
  K.initiales = t => String(t || '?').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
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
      '<div class="side-voile" id="k-voile" aria-hidden="true"></div><aside class="side"><div class="side-logo"><img src="/ui/logo-kreative-noir.png" alt="Kreative"></div>' +
      (conf.cta ? '<a class="side-cta" href="' + K.esc(conf.cta.href) + '">' + K.esc(conf.cta.texte) + K.i.fleche.replace('<svg', '<svg width="16" height="16"') + '</a>' : '') +
      '<div class="side-nav">' + nav + '</div>' +
      // toute la zone du profil ouvre le menu du compte
      '<div class="side-foot"><div class="menu" id="k-menu" hidden>' + (conf.menu || []).join('') +
      (conf.sansTheme || conf.clair ? '' : '<button id="k-theme2">' + (sombre ? K.i.soleil : K.i.lune) + (sombre ? 'Thème clair' : 'Thème sombre') + '</button>') +
      '<a href="' + K.esc(conf.sortie) + '">' + K.i.sortie + (conf.anglais ? 'Log out' : 'Se déconnecter') + '</a></div>' +
      '<button class="compte" id="k-menu-btn" aria-label="Menu du compte" aria-expanded="false">' +
      (conf.qui.photo ? '<img class="av-img' + (conf.qui.rond ? ' rond' : '') + '" src="' + K.esc(conf.qui.photo) + '" alt="">' : conf.qui.tuile ? K.tuile(conf.qui.nom) : '<span class="av">' + K.esc(K.initiales(conf.qui.nom)) + '</span>') +
      '<span class="qui"><b>' + K.esc(conf.qui.nom) + '</b><small>' + K.esc(conf.qui.role) + '</small></span>' + K.i.hautBas + '</button></div></aside>' +
      '<div class="main"><div class="panel"><header class="top">' +
      '<button class="icon-btn burger" id="k-burger" aria-label="Menu">' + K.i.menu + '</button>' +
      '<div class="ariane">' + ariane + '</div>' +
      (conf.recherche ? '<div class="search">' + K.i.chercher + '<input id="k-cherche" placeholder="' + K.esc(conf.cherche || 'Rechercher un client, un projet, un dossier…') + '" autocomplete="off"><kbd>⌘K</kbd><div class="res" id="k-res" hidden></div></div>' : '') +
      (conf.clair ? '' : '<div class="top-r"><button class="icon-btn" id="k-theme" title="' + (sombre ? 'Thème clair' : 'Thème sombre') + '">' + (sombre ? K.i.soleil : K.i.lune) + '</button></div>') +
      '</header><div class="scroll"><div class="page' + (large === 'plein' ? ' plein' : large === 'centre' ? ' centre' : large ? ' large' : '') + '">' + contenu + '</div></div></div></div></div>';
  };
  K.brancherCoquille = conf => {
    const b = id => document.getElementById(id);
    if (b('k-theme')) b('k-theme').onclick = K.basculerTheme;
    if (b('k-theme2')) b('k-theme2').onclick = K.basculerTheme;
    // menu mobile : le voile à côté le referme toujours, comme un lien du menu (même vers la page déjà ouverte)
    if (b('k-burger')) b('k-burger').onclick = e => { e.stopPropagation(); b('k-app').classList.toggle('menu-ouvert'); };
    if (b('k-voile')) b('k-voile').onclick = e => { e.stopPropagation(); K.fermerMenu(); };
    document.querySelectorAll('.side a').forEach(a => a.addEventListener('click', () => setTimeout(K.fermerMenu, 0)));
    if (b('k-menu-btn')) b('k-menu-btn').onclick = e => { e.stopPropagation(); b('k-menu').hidden = !b('k-menu').hidden; b('k-menu-btn').setAttribute('aria-expanded', String(!b('k-menu').hidden)); };
    if (!K.ecouteMenu) {   // une seule fois : un clic ailleurs referme le menu du compte
      K.ecouteMenu = true;
      document.addEventListener('click', e => { const m = document.getElementById('k-menu'); if (m && !m.hidden && !e.target.closest('#k-menu')) { m.hidden = true; const mb = document.getElementById('k-menu-btn'); if (mb) mb.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') K.fermerMenu(); });
    }
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
  K.fermerMenu = () => { const m = document.getElementById('k-menu'); if (m) m.hidden = true; const mb = document.getElementById('k-menu-btn'); if (mb) mb.setAttribute('aria-expanded', 'false'); const a = document.getElementById('k-app'); if (a) a.classList.remove('menu-ouvert'); };
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

  // ============================================================
  //  PRODUCTION : les projets du dépôt et leurs pages, ouvertes
  //  DANS le portail (cadre intégré), avec un choix du projet.
  //  Utilisé par l'admin, l'espace stratégiste et l'espace designer.
  // ============================================================
  const P = K.prod = { liste: null };
  P.charger = async force => {
    if (P.liste && !force) return P.liste;
    let projets = await K.lireJson('/projets.json');
    if (!Array.isArray(projets)) projets = [];
    P.sigListe = projets.map(x => x && x.dossier).filter(Boolean).sort().join(',');
    P.liste = (await Promise.all(projets.filter(x => x && x.dossier && !/^TEST_(?!DEMO_)/i.test(x.dossier)).map(async x => {
      const [d, envois, liv, retour] = await Promise.all(['donnees', 'envois', 'livraison', 'retour'].map(f => K.lireJson('/' + x.dossier + '/' + f + '.json')));
      const aRetour = !!(retour && retour.dossier === x.dossier);
      if (!d) return null;
      const ev = (envois && Array.isArray(envois.envois)) ? envois.envois : [];
      const dernier = ev[ev.length - 1];
      const livs = (liv && liv.livraisons) || [], der = livs[livs.length - 1] || {};
      const l = d.livraison;
      return { dossier: x.dossier, demo: K.estDemo(x.dossier), d, prod: (l && l.projet) || x.dossier, marque: d.brand_name || x.dossier,
        nom: (d.brand_name || x.dossier) + (l && l.sur > 1 ? ' · livraison ' + l.n + '/' + l.sur : ''),
        nb: d.nb_creas || x.nb_creas || 0, pack: d.pack || x.pack || '', retour: aRetour, retourLe: aRetour ? Date.parse(retour.recu_le || '') || 0 : 0,
        envoye: ev.length > 0, envoyeLe: Date.parse(typeof dernier === 'string' ? dernier : (dernier || {}).le || '') || 0,
        livre: !!(liv && liv.livre), livreLe: Date.parse(der.le || '') || 0, zip: der.lien || '', livraisons: livs,
        strat: Date.parse(d.deadline_strategiste || '') || 0, desi: Date.parse(d.deadline_designer || '') || 0, client: Date.parse(d.deadline || '') || 0 };
    }))).filter(Boolean);
    await P.chargerEtats();
    return P.liste;
  };
  // Les options payées par le client. Variations de texte (depuis le 22/10/2026) : sur chaque créa, le même
  // visuel avec 1 ou 2 textes en plus (« variations:2 » = 3 textes par créa), dans chaque livraison.
  // Anciennes commandes : A/B test visuel (n créas en plus) et A/B test texte (n versions B en plus), qu'un
  // Custom livré en plusieurs fois répartit entre ses livraisons. Express : délais divisés par deux.
  P.part = (total, l) => !(l && l.sur > 1) ? total : Math.floor(total / l.sur) + ((l.n || 1) <= total % l.sur ? 1 : 0);
  P.lireOptions = (s, l) => {
    const o = { abv: 0, abt: 0, vari: 0, express: false };
    String(s || '').split(',').forEach(x => { const [id, q] = x.split(':'); if (id === 'express') o.express = true;
      else if (id === 'variations') o.vari = Math.min(2, Math.max(1, Number(q) || 1));
      else if (id === 'ab_visuel') o.abv = P.part(Number(q) || 0, l); else if (id === 'ab_texte') o.abt = P.part(Number(q) || 0, l); });
    return o;
  };
  // le nombre de créatives à produire : celles du pack (× les textes des variations), plus les anciens A/B tests
  P.total = x => (Number(x.nb) || 0) * (1 + ((x.opts || {}).vari || 0)) + ((x.opts || {}).abv || 0) + ((x.opts || {}).abt || 0);
  P.optionsTexte = (x, en) => {
    const o = x.opts || {}, t = [];
    if (o.vari) t.push(en ? 'Copy variations: ' + (o.vari + 1) + ' texts per creative' : 'Variations de texte : ' + (o.vari + 1) + ' textes par créa');
    if (o.abv) t.push(en ? 'A/B visual test on ' + o.abv + ' creative' + (o.abv > 1 ? 's' : '') : 'A/B visuel sur ' + o.abv + ' créa' + (o.abv > 1 ? 's' : ''));
    if (o.abt) t.push(en ? 'A/B copy test on ' + o.abt + ' creative' + (o.abt > 1 ? 's' : '') : 'A/B texte sur ' + o.abt + ' créa' + (o.abt > 1 ? 's' : ''));
    if (o.express) t.push('Express');
    return t.join(' · ');
  };
  P.celluleOptions = (x, en) => { const t = P.optionsTexte(x, en); return t ? '<span class="sub" style="color:var(--blue-tx)">' + K.esc(t) + '</span>' : ''; };
  // l'état de production, calculé de la même façon pour l'admin, le stratégiste et la designer :
  // la dernière version déposée dans le portail, un déplacement fait dans le Kanban, la commande du client
  P.chargerEtats = async donnees => {
    let r = donnees;
    if (!r) { try { r = await K.api('/api/equipe/etats'); } catch (e) { r = { etats: {}, commandes: {} }; } }
    P.etats = r;
    (P.liste || []).forEach(x => {
      const e = (r.etats || {})[x.dossier] || {};
      x.v = e.v || null; x.o = e.o || null;
      const l = x.d.livraison, base = (l && l.projet) || x.dossier;
      x.k = (r.commandes || {})[x.dossier] || ((!l || !(l.sur > 1) || l.n >= l.sur) ? (r.commandes || {})[base] : null) || null;
      x.opts = P.lireOptions((r.options || {})[x.dossier] || (r.options || {})[base] || '', l);
      if (x.livreDepot === undefined) x.livreDepot = x.livre;
      x.etape = P.etape(x);
      x.livre = ['livrer', 'client'].includes(x.etape.cle);
      if (x.v && x.v.statut !== 'brouillon' && x.livre) x.livreLe = Math.max(x.livreLe || 0, x.v.le || 0);
    });
  };
  // tout le monde voit la même chose en même temps : l'état est relu toutes les 20 s (et au retour sur l'onglet),
  // et la page se redessine seulement s'il a changé, jamais pendant une saisie, une fenêtre ou un glisser
  P.surveiller = rendre => {
    if (P.surveille) return; P.surveille = true;
    let signature = JSON.stringify(P.etats || {});
    const verifier = async () => {
      if (document.visibilityState !== 'visible' || !P.liste) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')) || document.querySelector('#k-fen, .rv-v, .kdrag, .kplace, .cal, .vp-cadre, .envoi-l:not(.fini), .envoye-anim, .toast')) return;
      // un nouveau projet (ou un projet archivé) : la liste est relue pour tout le monde, sans recharger la page
      const pj = await K.lireJson('/projets.json');
      const liste = Array.isArray(pj) ? pj.map(x => x && x.dossier).filter(Boolean).sort().join(',') : null;
      if (liste !== null && P.sigListe !== undefined && liste !== P.sigListe) { P.sigListe = liste; await P.charger(true); signature = JSON.stringify({ etats: (P.etats || {}).etats, commandes: (P.etats || {}).commandes }); rendre(); return; }
      if (liste !== null) P.sigListe = liste;
      let r; try { r = await K.api('/api/equipe/etats'); } catch (e) { return; }
      const sig = JSON.stringify({ etats: r.etats, commandes: r.commandes });
      if (sig === signature) return;
      signature = sig; await P.chargerEtats(r); rendre();
    };
    signature = JSON.stringify({ etats: (P.etats || {}).etats, commandes: (P.etats || {}).commandes });
    setInterval(verifier, 20000);
    document.addEventListener('visibilitychange', verifier);
  };
  P.etape = x => {
    const v = x.v;
    let cle, retouche = null, ts = 0;
    if (v) {
      ts = v.le || 0;
      if (v.statut === 'a_verifier') cle = 'livrer';
      else if (['envoyee', 'approuvee'].includes(v.statut)) cle = 'client';
      else if (['a_corriger', 'review_terminee'].includes(v.statut)) { retouche = v.retouche || 'designer'; cle = retouche === 'strategiste' ? 'strat' : 'desi'; }
      else cle = 'desi';
    } else {
      ts = Math.max(x.envoyeLe || 0, x.livreLe || 0);
      cle = x.k && ['livre', 'revisions', 'valide'].includes(x.k) ? 'client' : x.livreDepot ? 'livrer' : x.envoye ? 'desi' : 'strat';
    }
    let manuel = false;
    if (x.o && x.o.etape && x.o.le > ts) { cle = x.o.etape; manuel = true; retouche = null; }
    return { cle, retouche, manuel, statut: v ? v.statut : null, version: v ? v.version : 0, valide: x.k === 'valide' };
  };
  P.trouver = id => (P.liste || []).find(x => x.dossier === id) || (P.liste || []).find(x => x.prod === id) || null;

  // une échéance lisible : « Dans 2 jours », « Dans 5 h », « En retard »
  P.echeance = (t, en) => {
    if (!t) return { pill: '', texte: en ? 'no deadline' : 'pas d\'échéance', retard: false };
    const reste = t - Date.now(), H = 36e5;
    if (reste < 0) return { pill: '<span class="pill r"><i></i>' + (en ? 'Late' : 'En retard') + '</span>', texte: en ? 'late' : 'en retard', retard: true };
    if (reste < 12 * H) { const h = Math.max(1, Math.round(reste / H)); return { pill: '<span class="pill n">' + (en ? 'Due in ' : 'Dans ') + h + ' h</span>', texte: (en ? 'in ' : 'dans ') + h + ' h' }; }
    const j = Math.round(reste / 24 / H), t2 = (en ? 'in ' : 'dans ') + j + (en ? ' day' : ' jour') + (j > 1 ? 's' : '');
    return { pill: '<span class="pill b"><i></i>' + t2.charAt(0).toUpperCase() + t2.slice(1) + '</span>', texte: t2 };
  };
  // où en est un projet de production
  P.etat = (x, en) => {
    const g = x.etape;
    if (g && g.retouche && g.cle === 'desi') return { cle: 'desi', texte: en ? (g.statut === 'a_corriger' ? 'Sent back to you' : 'Client feedback to fix') : 'Retouches · visuels', pill: 'v' };
    if (g && g.retouche && g.cle === 'strat') return { cle: 'strat', texte: en ? 'Copy fixes by the strategist' : 'Retouches · textes', pill: 'v' };
    if (g && g.cle === 'strat' && x.envoye) return { cle: 'strat', texte: en ? 'With the strategist' : 'Chez le stratégiste', pill: 'b' };
    if (g && g.cle === 'desi') { const e = P.echeance(x.desi, en); return { cle: 'desi', texte: e.retard ? (en ? 'Late' : 'Designer en retard') : (en ? 'To deliver' : 'Chez le designer'), pill: e.retard ? 'r' : 'v' }; }
    if (!x.envoye) { const e = P.echeance(x.strat, en); return { cle: 'strat', texte: e.retard ? (en ? 'Brief late' : 'Fiche en retard') : (en ? 'With the strategist' : 'Fiche à remplir'), pill: e.retard ? 'r' : 'b' }; }
    if (!x.livre) { const e = P.echeance(x.desi, en); return { cle: 'desi', texte: e.retard ? (en ? 'Late' : 'Designer en retard') : (en ? 'To deliver' : 'Chez le designer'), pill: e.retard ? 'r' : 'v' }; }
    return { cle: 'livre', texte: en ? 'Delivered' : 'Livré par le designer', pill: 'g' };
  };
  P.pill = (x, en) => { const e = P.etat(x, en); return '<span class="pill ' + e.pill + '"><i></i>' + K.esc(e.texte) + '</span>'; };
  // ce que voit le stratégiste : seulement SA fiche (à remplir, en retard, envoyée à l'heure ou non)
  P.etatStrat = x => {
    if (x.etape && x.etape.retouche === 'strategiste' && x.etape.cle === 'strat') return { cle: 'retouches', texte: 'Retouches de textes', pill: 'v' };
    if (x.etape && x.etape.cle === 'strat' && x.envoye) return { cle: 'afaire', texte: 'Fiche à reprendre', pill: 'b' };
    if (!x.envoye) return x.strat && x.strat < Date.now() ? { cle: 'retard', texte: 'Fiche en retard', pill: 'r' } : { cle: 'afaire', texte: 'Fiche à remplir', pill: 'b' };
    if (x.strat && x.envoyeLe > x.strat) { const h = Math.max(1, Math.round((x.envoyeLe - x.strat) / 36e5)); return { cle: 'tard', texte: 'Envoyée avec ' + (h >= 24 ? Math.round(h / 24) + ' j' : h + ' h') + ' de retard', pill: 'a' }; }
    return { cle: 'heure', texte: 'Envoyée à l\'heure', pill: 'g' };
  };
  P.pillStrat = x => { const e = P.etatStrat(x); return '<span class="pill ' + e.pill + '"><i></i>' + K.esc(e.texte) + '</span>'; };
  // le type de projet, dit clairement : commande unique, sur-mesure en plusieurs livraisons, abonnement
  const MOIS_P = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  P.type = (x, en) => {
    const d = x.d || {}, l = d.livraison;
    if (d.abonnement || (l && l.type === 'abonnement')) { const m = new Date(x.client || Date.now()).getMonth(); return { t: en ? 'Subscription' : 'Abonnement', s: en ? 'month of ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m] : 'mois de ' + MOIS_P[m] }; }
    if (l && l.sur > 1) return { t: en ? 'Custom, split' : 'Sur-mesure', s: (en ? 'delivery ' : 'livraison ') + l.n + (en ? ' of ' : ' sur ') + l.sur };
    return { t: en ? 'One-off order' : 'Commande unique', s: 'Pack ' + ((x.pack || '').charAt(0).toUpperCase() + (x.pack || '').slice(1)) };
  };
  P.celluleType = (x, en) => { const t = P.type(x, en); return '<b style="font-weight:500">' + K.esc(t.t) + '</b><span class="sub">' + K.esc(t.s) + '</span>'; };
  P.celluleCreas = (x, en) => { const l = (x.d || {}).livraison, tot = P.total(x), plus = tot - (Number(x.nb) || 0);
    const vari = (x.opts || {}).vari || 0, ab = plus - (Number(x.nb) || 0) * vari;
    return '<b style="font-weight:500">' + K.esc(tot || '?') + '</b>' + (vari ? '<span class="sub">' + x.nb + (en ? ' × ' + (vari + 1) + ' texts' : ' × ' + (vari + 1) + ' textes') + '</span>' : '') +
      (ab ? '<span class="sub">' + (vari ? '' : x.nb) + ' + ' + ab + ' A/B</span>' : '') +
      (l && l.sur > 1 && l.total_creas ? '<span class="sub">' + (en ? 'of ' : 'sur ') + l.total_creas + (en ? ' in total' : ' au total') + '</span>' : ''); };

  // les sections et la page qu'elles ouvrent
  P.sections = {
    fiche: { fr: 'Fiches créas', en: 'Strategy briefs', icone: 'doc', ok: () => true, src: x => '/fiche/?projet=' + encodeURIComponent(x.dossier) },
    dossier: { fr: 'Dossiers de production', en: 'Production files', icone: 'calques', ok: x => x.prod === x.dossier || !(P.liste || []).some(y => y.dossier === x.prod), src: x => '/' + x.prod + '/' },
    brief: { fr: 'Briefs suivants', en: 'Next briefs', icone: 'message', ok: x => x.retour, src: x => '/retours/?projet=' + encodeURIComponent(x.dossier) },
    visuels: { fr: 'Visuels', en: 'Previews', icone: 'image', ok: x => x.envoye, src: x => '/' + x.dossier + '/creas/' },
    telechargement: { fr: 'Téléchargements', en: 'Downloads', icone: 'telecharger', ok: x => x.envoye, src: x => '/' + x.dossier + '/creas/telecharger.html' }
  };
  const avecIntegre = u => u + (u.includes('?') ? '&' : '?') + 'integre=1';
  // une adresse de page de production → la route du portail
  P.route = chemin => {
    const u = new URL(chemin, location.origin), q = u.searchParams.get('projet'), c = u.pathname;
    let m;
    if (/^\/fiche\/(index\.html)?$/.test(c)) return 'fiche' + (q ? '/' + q : '');
    if (/^\/retours\/(index\.html)?$/.test(c)) return 'brief' + (q ? '/' + q : '');
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/creas\/telecharger\.html$/))) return 'telechargement/' + m[1];
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/creas\/(index\.html)?$/))) return 'visuels/' + m[1];
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/(index\.html)?$/)) && !/^(admin|client|strategiste|designer|fiche|retours|ui)$/.test(m[1])) return 'dossier/' + m[1];
    return null;
  };
  // une page intégrée demande à ouvrir une autre page de production : on reste dans le portail
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.kreative !== 'aller') return;
    const r = P.route(e.data.chemin);
    if (r && P.autorisees && !P.autorisees.includes(r.split('/')[0])) { location.href = e.data.chemin; return; }
    if (r) K.aller('#/' + r); else location.href = e.data.chemin;
  });

  // la liste des projets d'une section (quand aucun n'est choisi)
  P.liste_ = (sec, opt) => {
    const S = P.sections[sec], en = opt.en, strat = opt.role === 'strategiste', l = (P.liste || []).filter(S.ok).sort((a, b) => (b.envoyeLe || b.strat || 0) - (a.envoyeLe || a.strat || 0));
    let h = '<div class="ph"><div><h1>' + K.esc(en ? S.en : S.fr) + '</h1><p>' + K.esc(opt.texte || (en ? 'Choose a project.' : 'Choisissez un projet.')) + '</p></div>' +
      '</div>';
    if (!l.length) return h + '<div class="card"><div class="vide">' + K.i[S.icone] + K.esc(en ? 'Nothing here yet.' : 'Rien ici pour le moment.') + '</div></div>';
    const brief = sec === 'brief';
    return h + '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + (en ? 'Project' : 'Projet') + '</th><th>Type</th><th class="num">' + (en ? 'Creatives' : 'Créas à faire') + '</th>' +
      (brief ? '<th>' + (en ? 'Received' : 'Reçu le') + '</th>' : '') + '<th>' + (en ? 'Status' : 'Statut') + '</th><th>' + (en ? 'Due' : 'À rendre avant') + '</th><th></th></tr></thead><tbody>' +
      l.map(x => {
        const ech = strat || !x.envoye ? x.strat : !x.livre ? x.desi : x.client;
        return '<tr class="clic" onclick="location.hash=\'#/' + sec + '/' + K.esc(x.dossier) + '\'"><td><div class="nom">' + K.tuile(x.marque) + '<div><b>' + K.esc(x.marque) + (x.demo ? ' <span class="pill demo">' + (en ? 'Demo' : 'Démo') + '</span>' : '') + '</b><span class="sub">' + K.esc(x.dossier) + '</span></div></div></td>' +
          '<td>' + P.celluleType(x, en) + '</td><td class="num">' + P.celluleCreas(x, en) + '</td>' +
          (brief ? '<td>' + (x.retourLe ? K.esc(K.dateHeure(x.retourLe)) : '<span class="muted">Pas encore</span>') + '</td>' : '') +
          '<td>' + (strat ? P.pillStrat(x) : P.pill(x, en)) + '</td><td>' + (ech ? K.esc(K.dateHeure(ech)) : '<span class="muted">Pas de date</span>') + '</td>' +
          '<td class="fin"><span class="btn btn-s btn-sm">' + (en ? 'Open' : 'Ouvrir') + ' ' + K.i.fleche.replace('<svg', '<svg width="14" height="14"') + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  };
  // la page d'un projet, dans le portail : barre (projet, autres pages) + la page en cadre
  P.vue = (sec, id, opt) => {
    const S = P.sections[sec], en = opt.en, secs = opt.sections || Object.keys(P.sections);
    const x = id === 'banque' ? null : P.trouver(id);
    const src = id === 'banque' ? '/fiche/' : x ? S.src(x) : sec === 'dossier' ? '/' + id + '/' : sec === 'visuels' ? '/' + id + '/creas/' : sec === 'telechargement' ? '/' + id + '/creas/telecharger.html' : sec === 'brief' ? '/retours/?projet=' + encodeURIComponent(id) : '/fiche/?projet=' + encodeURIComponent(id);
    const choix = (P.liste || []).filter(S.ok);
    if (x && !choix.includes(x)) choix.unshift(x);
    const autres = x ? secs.filter(k => k !== sec && P.sections[k].ok(x)) : [];
    return '<div class="vp"><div class="vp-barre"><a class="btn btn-g btn-sm" href="#/' + sec + '">' + K.i.gauche + K.esc(en ? S.en : S.fr) + '</a>' +
      '<div class="vp-choix"><select class="in" id="vp-projet">' + (id === 'banque' ? '<option value="banque" selected>' + (en ? 'Inspiration bank' : 'Banque d\'inspirations') + '</option>' : '') +
      (!x && id !== 'banque' ? '<option value="' + K.esc(id) + '" selected>' + K.esc(id) + '</option>' : '') +
      choix.map(y => '<option value="' + K.esc(y.dossier) + '"' + (x === y ? ' selected' : '') + '>' + K.esc(y.nom) + ' · ' + K.esc(y.nb || '?') + (en ? ' creatives' : ' créas') + '</option>').join('') + '</select></div>' +
      (x ? (opt.role === 'strategiste' ? P.pillStrat(x) : P.pill(x, en)) : '') +
      (autres.length ? '<div class="vp-autres">' + autres.map(k => '<a class="btn btn-s btn-sm" href="#/' + k + '/' + K.esc(x.dossier) + '">' + K.i[P.sections[k].icone] + K.esc(en ? P.sections[k].en : P.sections[k].fr) + '</a>').join('') + '</div>' : '') +
      '</div><iframe class="vp-cadre" id="vp-cadre" src="' + K.esc(avecIntegre(src)) + '" title="' + K.esc(en ? S.en : S.fr) + '"></iframe></div>';
  };
  P.brancher = sec => {
    const s = document.getElementById('vp-projet');
    if (s) s.onchange = () => K.aller('#/' + sec + '/' + s.value);
  };
})();

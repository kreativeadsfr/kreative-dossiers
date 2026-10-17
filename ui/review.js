/* ============================================================
   KREATIVE · LA REVIEW DES CRÉATIVES
   Utilisée par le client (sa review), l'admin (vérifier avant
   d'envoyer) et la designer (voir les retours).
   - Une grille par format (1:1, 4:5, 9:16), repliable.
   - Une visionneuse : précédente / suivante, annotations
     (rectangle, cercle, flèche), commentaires, approuver.
   - Tout télécharger (un zip, un dossier par format).
   Les données viennent du Worker (/api/client/... ou /api/equipe/...).
   ============================================================ */
(function () {
  const K = window.K;
  const esc = K.esc;
  const RV = K.rv = {};
  const NOMS_FORMATS = { '1x1': '1:1', '4x5': '4:5', '9x16': '9:16', autre: 'Autres formats' };
  const ORDRE = ['1x1', '4x5', '9x16', 'autre'];
  const COULEURS = ['#e5484d', '#f5a524', '#30a46c', '#12a594', '#8e4ec6'];
  const p = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const I = {
    dossier: p('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    fleche: p('<path d="m9 6 6 6-6 6"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    curseur: p('<path d="m5 3 14 7-6 2-2 6Z"/>'),
    rect: p('<rect x="4" y="5" width="16" height="14" rx="1.5"/>'),
    cercle: p('<circle cx="12" cy="12" r="8"/>'),
    trait: p('<path d="M5 19 19 5M19 5h-7M19 5v7"/>'),
    oeil: p('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    gauche: p('<path d="m15 18-6-6 6-6"/>'),
    droite: p('<path d="m9 6 6 6-6 6"/>'),
    coche: p('<path d="M5 12.5 10 17 19 7"/>'),
    bulle: p('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.5-.7L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5Z"/>'),
    x: p('<path d="M6 6l12 12M18 6 6 18"/>'),
    poubelle: p('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    envoi: p('<path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z"/>')
  };
  RV.taille = n => !n ? '' : n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko';
  RV.formats = l => ORDRE.filter(f => l.fichiers.some(x => x.format === f));
  const quand = t => { const d = (Date.now() - t) / 6e4, en = enCours === 'en';
    if (en) return d < 1 ? 'just now' : d < 60 ? Math.round(d) + ' min ago' : d < 1440 ? Math.round(d / 60) + ' h ago' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
    return d < 1 ? 'à l\'instant' : d < 60 ? 'il y a ' + Math.round(d) + ' min' : d < 1440 ? 'il y a ' + Math.round(d / 60) + ' h' : K.date(t, { year: undefined }); };
  const ouverts = {};   // les dossiers repliés ou non, par livraison
  // la designer lit l'anglais
  const EN = { 'Tout télécharger': 'Download all', 'fichier': 'file', ' à reviewer': ' to review', 'approuvé': 'approved', 'commentaire': 'comment', 'Aucun fichier pour l\'instant.': 'No file yet.',
    'Image': 'Image', 'Vidéo': 'Video', 'Télécharger': 'Download', 'Retour': 'Back', 'Commentaires': 'Comments', '✓ Approuvée par le client': '✓ Approved by the client', 'Aucun commentaire pour l\'instant.': 'No comment yet.',
    'Commentaire interne (le client ne le voit pas)…': 'Note for Kreative…', 'Envoyer': 'Send', 'Préparation…': 'Preparing…', 'Annotation jointe': 'Drawing attached', 'Dessinez sur l\'image pour pointer un détail, puis écrivez.': 'Draw on the image to point at a detail, then write.',
    'Écrivez votre retour ci-dessous.': 'Write below.', 'Kreative · interne': 'Kreative · internal', 'Sélection': 'Select', 'Flèche': 'Arrow', 'Cercle': 'Circle' };
  let enCours = 'fr';
  const T = t => enCours === 'en' && EN[t] != null ? EN[t] : t;

  // ---------- la grille ----------
  // opt : { mode: 'client'|'admin'|'designer', titre, sousTitre, actions (HTML), modifiable, supprimer (designer, brouillon) }
  RV.grille = (l, opt) => {
    enCours = opt.mode === 'designer' ? 'en' : 'fr';
    const F = l.fichiers, nbCom = F.reduce((s, f) => s + f.commentaires.filter(c => !c.interne).length, 0), nbOk = F.filter(f => f.approuve_le).length;
    let h = '<div class="rv"><div class="rv-tete"><div><h2>' + esc(opt.titre || 'Vos créatives') + '</h2><p>' + esc(opt.sousTitre || (F.length + ' ' + T('fichier') + (F.length > 1 ? 's' : '') + (opt.mode === 'client' && l.statut === 'envoyee' ? T(' à reviewer') : ''))) +
      (F.length ? ' · ' + nbOk + ' ' + T('approuvé') + (nbOk > 1 ? 's' : '') + (nbCom ? ' · ' + nbCom + ' ' + T('commentaire') + (nbCom > 1 ? 's' : '') : '') : '') + '</p></div>' +
      '<div class="rv-actions">' + (opt.actions || '') + (F.length ? '<button class="btn btn-s" data-rv-zip>' + I.telecharger + T('Tout télécharger') + '</button>' : '') + '</div></div>';
    if (!F.length) return h + '<div class="card"><div class="vide">' + T('Aucun fichier pour l\'instant.') + '</div></div></div>';
    RV.formats(l).forEach(fmt => {
      const liste = F.filter(f => f.format === fmt), cle = l.id + fmt, ouvert = ouverts[cle] === true;   // fermés au départ : on ouvre celui qu'on veut
      h += '<div class="rv-dossier' + (ouvert ? ' ouvert' : '') + '"><button class="rv-dh" data-rv-plier="' + esc(cle) + '"><span class="chev">' + I.fleche + '</span>' + I.dossier + '<b>' + esc(NOMS_FORMATS[fmt]) + '</b><span class="nb">' + liste.length + ' ' + T('fichier') + (liste.length > 1 ? 's' : '') + '</span></button>' +
        (ouvert ? '<div class="rv-grille">' + liste.map(f => {
          const coms = f.commentaires.filter(c => opt.mode !== 'client' || !c.interne).length, video = /^video\//.test(f.type);
          return '<div class="rv-carte" data-rv-voir="' + esc(f.id) + '"><div class="rv-mini">' +
            (video && !/mini=1/.test(f.mini) ? '<video src="' + esc(f.url) + '#t=0.5" muted preload="metadata"></video>' : '<img src="' + esc(f.mini) + '" alt="" loading="lazy">') +
            (f.approuve_le ? '<span class="rv-ok" title="Approuvée">' + I.coche + '</span>' : '') + (coms ? '<span class="rv-coms' + (opt.supprimer ? ' bas' : '') + '">' + I.bulle + coms + '</span>' : '') +
            (opt.supprimer ? '<button class="rv-retirer" data-rv-suppr="' + esc(f.id) + '" title="Remove this file" aria-label="Remove ' + esc(f.nom) + '">' + I.x + '</button>' : '') + '</div>' +
            '<div class="rv-pied"><div><b title="' + esc(f.nom) + '">' + esc(f.nom) + '</b><small>' + T(video ? 'Vidéo' : 'Image') + ' · ' + esc(RV.taille(f.taille)) + '</small></div>' +
            '<a class="rv-ico" href="' + esc(f.url) + '?dl=1" download="' + esc(f.nom) + '" title="' + T('Télécharger') + '" data-rv-stop>' + I.telecharger + '</a></div></div>';
        }).join('') + '</div>' : '') + '</div>';
    });
    return h + '</div>';
  };
  RV.brancher = (l, opt) => {
    document.querySelectorAll('[data-rv-plier]').forEach(b => b.onclick = () => { ouverts[b.dataset.rvPlier] = !ouverts[b.dataset.rvPlier]; opt.rendre(); });
    document.querySelectorAll('[data-rv-stop]').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
    document.querySelectorAll('[data-rv-voir]').forEach(c => c.onclick = e => { if (e.target.closest('[data-rv-suppr]')) return; RV.voir(l, c.dataset.rvVoir, opt); });
    document.querySelectorAll('[data-rv-zip]').forEach(b => b.onclick = () => RV.zip(l, opt.nomZip || 'creatives', b));
  };

  // ---------- tout télécharger : un zip, un dossier par format ----------
  let jszip = null;
  RV.zip = async (l, nom, bouton) => {
    const lab = bouton.innerHTML; bouton.disabled = true; bouton.textContent = T('Préparation…');
    try {
      if (!window.JSZip) { if (!jszip) jszip = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); await jszip; }
      const z = new window.JSZip();
      let n = 0;
      for (const f of l.fichiers) {
        const r = await fetch(f.url, { credentials: 'same-origin' });
        if (r.ok) z.folder(NOMS_FORMATS[f.format].replace(':', 'x').replace(' ', '-')).file(f.nom, await r.blob());
        bouton.textContent = T('Préparation…') + ' ' + (++n) + '/' + l.fichiers.length;
      }
      const b = await z.generateAsync({ type: 'blob' }), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = nom + '.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch (e) { K.toast('Le téléchargement n\'a pas pu se préparer. Téléchargez les fichiers un par un.'); }
    bouton.disabled = false; bouton.innerHTML = lab;
  };

  // ---------- la visionneuse ----------
  // opt.api : { commenter(f, texte, forme, couleur), supprimer(id), approuver(f, oui) } ; opt.peutCommenter, opt.peutApprouver
  RV.voir = (l, id, opt) => {
    enCours = opt.mode === 'designer' ? 'en' : 'fr';
    const liste = RV.formats(l).flatMap(fmt => l.fichiers.filter(f => f.format === fmt));
    let n = Math.max(0, liste.findIndex(f => f.id === id)), outil = 'curseur', couleur = COULEURS[0], forme = null, visibles = true, survol = null;
    const v = document.createElement('div');
    v.className = 'rv-v';
    document.body.appendChild(v);
    const fermer = () => { v.remove(); document.removeEventListener('keydown', clavier); if (opt.rendre) opt.rendre(); };
    const clavier = e => {
      if (e.target.closest && e.target.closest('textarea')) return;
      if (e.key === 'Escape') fermer();
      if (e.key === 'ArrowRight' && n < liste.length - 1) { n++; forme = null; dessiner(); }
      if (e.key === 'ArrowLeft' && n > 0) { n--; forme = null; dessiner(); }
    };
    document.addEventListener('keydown', clavier);
    const svgForme = (f, coul, cls) => {
      if (!f) return '';
      const x1 = f.x1 * 1000, y1 = f.y1 * 1000, x2 = f.x2 * 1000, y2 = f.y2 * 1000, st = 'stroke="' + coul + '" fill="none" stroke-width="3" vector-effect="non-scaling-stroke" class="' + (cls || '') + '"';
      if (f.t === 'rect') return '<rect x="' + Math.min(x1, x2) + '" y="' + Math.min(y1, y2) + '" width="' + Math.abs(x2 - x1) + '" height="' + Math.abs(y2 - y1) + '" rx="6" ' + st + '/>';
      if (f.t === 'cercle') return '<ellipse cx="' + (x1 + x2) / 2 + '" cy="' + (y1 + y2) / 2 + '" rx="' + Math.abs(x2 - x1) / 2 + '" ry="' + Math.abs(y2 - y1) / 2 + '" ' + st + '/>';
      const ang = Math.atan2(y2 - y1, x2 - x1), L = 26, a1 = ang + 2.6, a2 = ang - 2.6;
      return '<g ' + st + '><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/><path d="M' + (x2 + L * Math.cos(a1)) + ' ' + (y2 + L * Math.sin(a1)) + ' L' + x2 + ' ' + y2 + ' L' + (x2 + L * Math.cos(a2)) + ' ' + (y2 + L * Math.sin(a2)) + '"/></g>';
    };
    const dessiner = () => {
      const f = liste[n], video = /^video\//.test(f.type);
      const coms = f.commentaires.filter(c => opt.mode !== 'client' || !c.interne);
      const peutCom = opt.peutCommenter && opt.peutCommenter(l), peutOk = opt.peutApprouver && opt.peutApprouver(l);
      v.innerHTML = '<div class="rv-vb"><button class="rv-retour" data-x>' + I.gauche + T('Retour') + '</button><b class="rv-nom">' + esc(f.nom) + ' <span>(' + (n + 1) + '/' + liste.length + ')</span></b>' +
        (video ? '' : '<div class="rv-outils">' + [['curseur', 'Sélection'], ['rect', 'Rectangle'], ['cercle', 'Cercle'], ['trait', 'Flèche']].map(([k, t]) =>
          '<button class="' + (outil === k ? 'on' : '') + '" data-outil="' + k + '" title="' + T(t) + '"' + (!peutCom && k !== 'curseur' ? ' disabled' : '') + '>' + I[k] + '</button>').join('') +
          '<i></i><button class="' + (visibles ? '' : 'barre') + '" data-oeil title="Afficher les annotations">' + I.oeil + '</button></div>') +
        '<div class="rv-nav"><button data-prec' + (n === 0 ? ' disabled' : '') + ' title="Précédente">' + I.gauche + '</button><button data-suiv' + (n === liste.length - 1 ? ' disabled' : '') + ' title="Suivante">' + I.droite + '</button></div></div>' +
        '<div class="rv-vc"><div class="rv-scene"><div class="rv-cadre' + (outil !== 'curseur' ? ' dessin' : '') + '">' +
        (video ? '<video src="' + esc(f.url) + '" controls playsinline></video>' : '<img src="' + esc(f.url) + '" alt="' + esc(f.nom) + '" draggable="false">' +
          '<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" class="rv-svg">' + (visibles ? coms.map(c => svgForme(c.forme, c.couleur, survol === c.id ? 'actif' : '')).join('') : '') + svgForme(forme, couleur, 'neuf') + '</svg>') +
        '</div></div>' +
        '<aside class="rv-panneau"><div class="rv-ph"><b>' + T('Commentaires') + '</b><button class="rv-ico" data-x title="Fermer">' + I.x + '</button></div>' +
        (opt.mode === 'client' ? (peutOk ? '<div class="rv-appr"><button class="btn ' + (f.approuve_le ? 'btn-ok' : 'btn-d') + ' btn-bloc" data-appr>' + I.coche + (f.approuve_le ? 'Approuvée · annuler' : 'Approuver cette version') + '</button></div>'
          : f.approuve_le ? '<div class="rv-appr"><div class="etat ok">✓ Approuvée</div></div>' : '')
          : f.approuve_le ? '<div class="rv-appr"><div class="etat ok">' + T('✓ Approuvée par le client') + '</div></div>' : '') +
        '<div class="rv-coms-l">' + (coms.length ? coms.map(c => '<div class="rv-com" data-com="' + c.id + '"><div class="rv-ch"><span class="av" style="background:' + (c.role === 'client' ? '#1f1f1f' : 'var(--blue)') + '">' + esc(K.initiales(c.auteur)) + '</span><b>' + esc(c.auteur) + '</b>' +
            (c.role !== 'client' ? '<span class="pill demo">' + (c.interne ? T('Kreative · interne') : 'Kreative') + '</span>' : '') + '<small>' + esc(quand(c.cree_le)) + '</small>' +
            (c.forme ? '<i class="rv-pastille" style="background:' + esc(c.couleur) + '"></i>' : '') +
            ((opt.mode === 'client' && c.role === 'client' && peutCom) || (opt.mode !== 'client' && c.role !== 'client') ? '<button class="rv-ico petit" data-suppr-com="' + c.id + '" title="Supprimer">' + I.poubelle + '</button>' : '') + '</div><p>' + esc(c.texte) + '</p></div>').join('')
          : '<div class="rv-vide">' + I.bulle + '<b>' + T('Aucun commentaire pour l\'instant.') + '</b><small>' + (peutCom ? T(video ? 'Écrivez votre retour ci-dessous.' : 'Dessinez sur l\'image pour pointer un détail, puis écrivez.') : '') + '</small></div>') + '</div>' +
        (peutCom ? '<div class="rv-ecrire">' + (forme ? '<div class="rv-joint"><i style="background:' + couleur + '"></i>' + T('Annotation jointe') + '<button data-sans>' + I.x + '</button></div>' : '') +
          '<textarea id="rv-texte" rows="3" placeholder="' + (opt.mode === 'client' ? 'Écrire un commentaire…' : T('Commentaire interne (le client ne le voit pas)…')) + '"></textarea>' +
          '<div class="rv-eb"><div class="rv-couleurs">' + COULEURS.map(c => '<button style="background:' + c + '" class="' + (c === couleur ? 'on' : '') + '" data-coul="' + c + '" title="Couleur"></button>').join('') + '</div>' +
          '<button class="btn btn-d btn-sm" data-envoyer>' + T('Envoyer') + '</button></div></div>' : '') +
        '</aside></div>';
      // les boutons
      v.querySelectorAll('[data-x]').forEach(b => b.onclick = fermer);
      const pr = v.querySelector('[data-prec]'), su = v.querySelector('[data-suiv]');
      if (pr) pr.onclick = () => { if (n > 0) { n--; forme = null; dessiner(); } };
      if (su) su.onclick = () => { if (n < liste.length - 1) { n++; forme = null; dessiner(); } };
      v.querySelectorAll('[data-outil]').forEach(b => b.onclick = () => { outil = b.dataset.outil; dessiner(); });
      const oe = v.querySelector('[data-oeil]'); if (oe) oe.onclick = () => { visibles = !visibles; dessiner(); };
      v.querySelectorAll('[data-coul]').forEach(b => b.onclick = () => { couleur = b.dataset.coul; const t = v.querySelector('#rv-texte').value; dessiner(); v.querySelector('#rv-texte').value = t; });
      const sans = v.querySelector('[data-sans]'); if (sans) sans.onclick = () => { const t = v.querySelector('#rv-texte').value; forme = null; dessiner(); v.querySelector('#rv-texte').value = t; };
      v.querySelectorAll('[data-com]').forEach(c => {
        c.onmouseenter = () => { survol = Number(c.dataset.com); majSvg(); };
        c.onmouseleave = () => { survol = null; majSvg(); };
      });
      v.querySelectorAll('[data-suppr-com]').forEach(b => b.onclick = async () => {
        try { await opt.api.supprimer(Number(b.dataset.supprCom)); f.commentaires = f.commentaires.filter(c => c.id !== Number(b.dataset.supprCom)); dessiner(); } catch (e) { K.toast(e.message); }
      });
      const ap = v.querySelector('[data-appr]');
      if (ap) ap.onclick = async () => { try { await opt.api.approuver(f, !f.approuve_le); f.approuve_le = f.approuve_le ? null : Date.now(); dessiner(); } catch (e) { K.toast(e.message); } };
      const en = v.querySelector('[data-envoyer]');
      if (en) en.onclick = async () => {
        const t = v.querySelector('#rv-texte').value.trim();
        if (!t) { v.querySelector('#rv-texte').focus(); return; }
        en.disabled = true;
        try {
          const r = await opt.api.commenter(f, t, forme, couleur);
          f.commentaires.push({ id: r.id, auteur: opt.auteur || 'Vous', role: opt.mode === 'client' ? 'client' : opt.mode, texte: t, forme, couleur, interne: opt.mode !== 'client', cree_le: Date.now() });
          if (opt.mode === 'client') f.approuve_le = null;
          forme = null; outil = 'curseur'; dessiner();
        } catch (e) { K.toast(e.message); en.disabled = false; }
      };
      // dessiner une annotation sur l'image
      const cadre = v.querySelector('.rv-cadre'), svg = v.querySelector('.rv-svg');
      if (cadre && svg && outil !== 'curseur') {
        let debut = null;
        const pos = e => { const r = svg.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
        cadre.onpointerdown = e => { e.preventDefault(); debut = pos(e); cadre.setPointerCapture(e.pointerId); };
        cadre.onpointermove = e => { if (!debut) return; const q = pos(e); forme = { t: outil === 'trait' ? 'fleche' : outil, x1: debut.x, y1: debut.y, x2: q.x, y2: q.y }; majSvg(); };
        cadre.onpointerup = () => {
          if (!debut) return; debut = null;
          if (!forme || (Math.abs(forme.x2 - forme.x1) < .01 && Math.abs(forme.y2 - forme.y1) < .01)) { forme = null; majSvg(); return; }
          const t = v.querySelector('#rv-texte') ? v.querySelector('#rv-texte').value : '';
          dessiner(); const z = v.querySelector('#rv-texte'); if (z) { z.value = t; z.focus(); }
        };
      }
      function majSvg() { if (svg) svg.innerHTML = (visibles ? coms.map(c => svgForme(c.forme, c.couleur, survol === c.id ? 'actif' : '')).join('') : '') + svgForme(forme, couleur, 'neuf'); }
    };
    dessiner();
  };

  // ---------- le choix d'une version (et d'une partie pour un projet en plusieurs livraisons) ----------
  RV.puces = (liste, actif, lib) => liste.length > 1 ? '<div class="filtres">' + liste.map(x => '<button class="chip' + (x.id === actif ? ' on' : '') + '" data-rv-version="' + esc(x.id) + '">' + esc(lib(x)) + '</button>').join('') + '</div>' : '';
})();

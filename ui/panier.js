/* ============================================================
   LE PANIER (commun) : le pack choisi, sa formule, ses options.
   Utilisé par l'espace client (#/commander/<pack>) et par la page
   publique de la landing (/commander/<pack>).
   Même calcul que le serveur (devis) ; le serveur recalcule de toute façon.
   Une option « par créa » se prend en quantité : de 1 au nombre de créas.
   ============================================================ */
(function () {
  const esc = K.esc, i = K.i;
  const PN = K.panier = {
    cfg: { pack: 'growth', nb: 30, formule: 'unique', options: [], qte: {} },
    d: null,   // { packs, custom, options }
    AVANTAGES: {
      starter: [['6 visuels Ads', 1], ['Tous les formats Meta', 1], ['2 cycles de révisions', 1], ['Livraison en 48 h', 1], ['Contact WhatsApp inclus', 1], ['Angles marketing variés', 0], ['Support prioritaire', 0], ['Stratégie personnalisée', 0]],
      growth: [['12 visuels Ads', 1], ['Tous les formats Meta', 1], ['Révisions illimitées', 1], ['Livraison en 48 h', 1], ['Contact WhatsApp inclus', 1], ['Angles marketing variés', 1], ['Support prioritaire', 0], ['Stratégie personnalisée', 0]],
      scale: [['24 visuels Ads', 1], ['Tous les formats Meta', 1], ['Révisions illimitées', 1], ['Livraison en 72 h', 1], ['Contact WhatsApp inclus', 1], ['Angles marketing variés', 1], ['Support prioritaire', 1], ['Stratégie personnalisée', 1]]
    },
    ENGAGEMENT: 'Les tarifs mensuels supposent un engagement de 3 mois, puis sans engagement. Résiliable à tout moment ensuite depuis votre espace.'
  };
  const C = () => PN.cfg, D = () => PN.d;
  PN.prixOpt = (o, pack) => (o.par_pack && o.par_pack[pack] != null) ? o.par_pack[pack] : o.valeur;
  PN.nb = () => C().pack === 'custom' ? C().nb : D().packs[C().pack].creas;
  // les A/B tests ensemble ne dépassent jamais le nombre de créas (12 sur un Growth : 7 + 5, par exemple)
  const parCrea = () => D().options.filter(o => o.type === 'par_crea' && C().options.includes(o.id)).map(o => o.id);
  PN.normaliser = () => {
    const c = C(), ids = parCrea(); let reste = PN.nb();
    ids.forEach((id, k) => { const max = Math.max(1, reste - (ids.length - k - 1)); c.qte[id] = Math.min(max, Math.max(1, Math.round(c.qte[id] || 1))); reste -= c.qte[id]; });
  };
  PN.qte = id => { PN.normaliser(); return C().qte[id] || 1; };
  PN.max = id => { PN.normaliser(); return PN.nb() - parCrea().filter(x => x !== id).reduce((n, x) => n + (C().qte[x] || 1), 0); };
  PN.choisir = (pack, formule) => {
    const c = C();
    if (c.pack !== pack) { c.pack = pack; c.options = []; c.qte = {}; }
    if (formule) c.formule = formule;
  };
  // les options envoyées au serveur : « express », « ab_visuel:5 »
  PN.liste = () => C().options.map(id => { const o = D().options.find(x => x.id === id); return o && o.type === 'par_crea' ? id + ':' + PN.qte(id) : id; });
  PN.devis = () => {
    const c = C(), d = D(), m = c.formule === 'mensuel', r = d.custom.remise_mensuel, lignes = [];
    const opts = d.options.filter(x => c.options.includes(x.id));
    let base, nb, u;
    if (c.pack !== 'custom') {
      const P = d.packs[c.pack]; nb = P.creas; base = m ? P.mensuel : P.unique; u = Math.floor(base / nb);
      lignes.push([nb + ' créatives', base]);
    } else {
      nb = c.nb; u = d.custom.paliers.filter(x => nb >= x[0]).pop()[1];
      base = nb * u; lignes.push([nb + ' créatives × ' + u + ' €', base]);
    }
    opts.filter(x => x.type === 'par_crea').forEach(x => { const q = PN.qte(x.id), v = q * x.valeur; lignes.push([x.nom + ' · ' + q + ' × ' + x.valeur + ' €', v]); base += v; });
    if (c.pack === 'custom' && m) { lignes.push(['Remise mensuelle −' + Math.round(r * 100) + ' %', -base * r]); base *= 1 - r; }
    opts.filter(x => x.type === 'pct').forEach(x => { const v = base * x.valeur / 100; lignes.push([x.nom + ' (+' + x.valeur + ' %)', v]); base += v; });
    opts.filter(x => x.type === 'fixe').forEach(x => { const v = PN.prixOpt(x, c.pack); lignes.push([x.nom, v]); base += v; });
    return { lignes, total: Math.round(base), nb, unitaire: u };
  };
  // le délai de livraison après le brief : celui du pack, ou selon le volume pour le Custom ; l'express le divise par deux
  PN.delai = () => {
    const c = C(), d = D();
    let h = c.pack === 'custom' ? (d.custom.delais.find(x => c.nb <= x[0]) || d.custom.delais[d.custom.delais.length - 1])[1] : d.packs[c.pack].delai;
    if (c.options.includes('express')) h = Math.round(h / 2);
    return h <= 72 ? h + ' h' : Math.round(h / 24) + ' jours';
  };
  // le Custom est livré en plusieurs fois au-delà de 30 créas (comme n8n le découpe) : le délai vaut pour chaque livraison
  PN.texteDelai = nb => {
    const lots = C().pack !== 'custom' || nb <= 30 ? 1 : nb <= 60 ? 2 : 4;
    return lots === 1 ? 'Livrée en ' + PN.delai() + ' après votre brief'
      : 'Livrée en ' + lots + ' fois, ' + (lots === 2 ? 'à 15 jours d\'intervalle' : 'une par semaine') + ' : chaque livraison en ' + PN.delai();
  };
  PN.corps = () => {
    const c = C(), P = D().packs[c.pack], noms = D().options.filter(o => c.options.includes(o.id)).map(o => o.nom + (o.type === 'par_crea' ? ' × ' + PN.qte(o.id) : ''));
    return { pack: c.pack, formule: c.formule, nb_creas: c.nb, options: PN.liste(),
      texte: 'Pack ' + P.nom + ', ' + PN.devis().nb + ' créatives (' + (c.formule === 'mensuel' ? 'mensuel' : 'commande unique') + ')' + (noms.length ? ' + ' + noms.join(', ') : '') };
  };

  // ---------- l'écran ----------
  // o : { formules (bool), retour (html), bouton : { texte } }
  PN.html = o => {
    o = o || {};
    const c = C(), d = D(), custom = c.pack === 'custom', P = d.packs[c.pack], CU = d.custom, m = c.formule === 'mensuel';
    let h = (o.retour || '') + '<div class="ph"><div><h1>' + (custom ? 'Votre pack Custom' : 'Pack ' + esc(P.nom)) + '</h1><p>' +
      (custom ? 'Choisissez le volume et les options que vous souhaitez.' : o.formules === false ? 'Choisissez les options que vous souhaitez.' : 'Choisissez la formule et les options que vous souhaitez.') + '</p></div></div>';
    h += '<div class="config"><div class="grid" style="gap:16px">';
    if (custom) h += '<div class="card bloc"><h3>Nombre de créatives</h3><p class="aide">Chaque créative est livrée en 1:1, 4:5 et 9:16.</p>' +
      '<div class="nb-creas"><b id="cf-nb">' + c.nb + '</b><span>créatives' + (m ? ' par mois' : '') + '</span></div>' +
      '<input class="curseur" type="range" id="cf-range" min="' + CU.min + '" max="' + CU.max + '" step="' + CU.pas + '" value="' + c.nb + '">' +
      '<div class="reperes"><span>' + CU.min + '</span><span>' + CU.max + '</span></div></div>';
    else h += '<div class="card bloc"><h3>Inclus dans le pack ' + esc(P.nom) + '</h3><ul class="inclus">' + PN.AVANTAGES[c.pack].filter(a => a[1]).map(a => '<li>' + i.coche + '<span>' + esc(a[0]) + '</span></li>').join('') + '</ul></div>';
    if (o.formules !== false) h += '<div class="card bloc"><h3>Formule</h3><div class="onglets" style="margin-top:14px"><button class="' + (m ? 'on' : '') + '" data-cf-formule="mensuel">Mensuel · ' + Math.round(CU.remise_mensuel * 100) + ' % de moins</button>' +
      '<button class="' + (!m ? 'on' : '') + '" data-cf-formule="unique">Commande unique</button></div>' +
      '<p class="aide" style="margin-top:12px">' + (m ? 'Prélevé chaque mois. ' + PN.ENGAGEMENT : 'Payé en une fois, sans engagement.') + '</p></div>';
    h += '<div class="card bloc"><h3>Options</h3><p class="aide">Pour aller plus loin sur ce pack.</p><div class="opts" id="cf-opts">' + PN.options() + '</div></div>';
    h += '</div><div class="card recap" id="cf-recap">' + PN.recap(o) + '</div></div>';
    return h;
  };
  // une option : cochée, et pour les A/B tests, combien de créas (− 3 +)
  PN.options = () => {
    const c = C(), nb = PN.nb();
    return D().options.map(o => {
      const on = c.options.includes(o.id), parCrea = o.type === 'par_crea', q = PN.qte(o.id), max = PN.max(o.id);
      const px = o.type === 'pct' ? '+' + o.valeur + ' %' : o.type === 'fixe' ? '+' + K.euros(PN.prixOpt(o, c.pack)) : '+' + o.valeur + ' €<small>par créa</small>';
      return '<div class="opt' + (on ? ' on' : '') + (on && parCrea ? ' avec-qte' : '') + '" data-cf-opt="' + esc(o.id) + '" role="checkbox" aria-checked="' + on + '" tabindex="0"><span class="case">' + i.coche + '</span>' +
        '<div class="opt-t"><b>' + esc(o.nom) + '</b><small>' + esc(o.detail) + '</small></div>' +
        (on && parCrea ? '<div class="qte" data-qte="' + esc(o.id) + '"><button type="button" data-moins aria-label="Une créa de moins"' + (q <= 1 ? ' disabled' : '') + '>−</button>' +
          '<span><b>' + q + '</b></span><button type="button" data-plus aria-label="Une créa de plus"' + (q >= max ? ' disabled' : '') + '>+</button></div>' : '') +
        '<span class="px">' + px + '</span></div>';
    }).join('');
  };
  PN.recap = o => {
    o = o || {};
    const d = PN.devis(), m = C().formule === 'mensuel', P = D().packs[C().pack];
    return '<div class="lab">Récapitulatif</div><h3 style="margin-top:8px">Pack ' + esc(P.nom) + '</h3>' +
      '<p class="muted" style="font-size:13px;margin-top:3px">' + (m ? 'Abonnement mensuel' : 'Commande unique') + '</p>' +
      '<div style="margin-top:14px">' + d.lignes.map(l => '<div class="ligne"><span>' + esc(l[0]) + '</span><b>' + (l[1] < 0 ? '−' : '') + K.euros(Math.abs(Math.round(l[1]))) + '</b></div>').join('') + '</div>' +
      '<div class="total"><span class="muted">Total' + (m ? ' par mois' : '') + '</span><b>' + K.euros(d.total) + '</b></div>' +
      '<div class="unitaire">' + K.euros(Math.floor(d.total / d.nb)) + ' <span>la créative</span></div>' +
      '<div class="delai">' + i.horloge + esc(PN.texteDelai(d.nb)) + '</div>' +
      '<a class="btn btn-d btn-bloc btn-lg" id="cf-payer" href="#" target="_blank" rel="noopener">' + esc((o.bouton && o.bouton.texte) || 'Commander') + '</a>' +
      '<p class="confiance petit"><span>' + i.cadenas + 'Paiement sécurisé par Stripe</span></p>';
  };
  // o : { surFormule(f), surChange(corps, lien), surClic(corps, lien, e), bouton }
  PN.brancher = o => {
    o = o || {};
    const maj = () => {
      const r = document.getElementById('cf-recap'), op = document.getElementById('cf-opts'); if (!r || !op) return;
      r.innerHTML = PN.recap(o); op.innerHTML = PN.options();
      const n = document.getElementById('cf-nb'); if (n) n.textContent = C().nb;
      opts(); payer();
    };
    const r = document.getElementById('cf-range');
    if (r) r.oninput = () => { C().nb = Number(r.value); maj(); };
    document.querySelectorAll('[data-cf-formule]').forEach(b => b.onclick = () => { C().formule = b.dataset.cfFormule; if (o.surFormule) o.surFormule(C().formule); });
    const opts = () => document.querySelectorAll('[data-cf-opt]').forEach(el => {
      const id = el.dataset.cfOpt;
      const basculer = () => { const c = C(); c.options = c.options.includes(id) ? c.options.filter(x => x !== id) : c.options.concat(id); maj(); const q = document.querySelector('[data-cf-opt="' + id + '"]'); if (q) q.focus({ preventScroll: true }); };
      el.onclick = e => { if (e.target.closest('.qte')) return; basculer(); };
      el.onkeydown = e => { if (e.target.closest('.qte')) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); basculer(); } };
      const qz = el.querySelector('.qte');
      if (qz) {
        const changer = n => { C().qte[id] = Math.min(PN.max(id), Math.max(1, PN.qte(id) + n)); maj(); const b = document.querySelector('[data-qte="' + id + '"] [data-' + (n > 0 ? 'plus' : 'moins') + ']'); if (b && !b.disabled) b.focus({ preventScroll: true }); };
        qz.querySelector('[data-moins]').onclick = e => { e.stopPropagation(); changer(-1); };
        qz.querySelector('[data-plus]').onclick = e => { e.stopPropagation(); changer(1); };
      }
    });
    const payer = () => {
      const b = document.getElementById('cf-payer'); if (!b) return;
      const corps = PN.corps();
      if (o.surChange) o.surChange(corps, b);
      b.onclick = e => { if (o.surClic) o.surClic(corps, b, e); };
    };
    opts(); payer();
  };
})();

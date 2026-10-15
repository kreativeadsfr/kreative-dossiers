/* ============================================================
   KREATIVE · COQUILLE DE L'ÉQUIPE (le comportement)
   Le Worker pose la coquille autour de la page et la configuration
   dans window.KC = { role, langue, type, projet }.
   Ici : le menu sur mobile, le menu du compte, la recherche ⌘K,
   le vrai nom du projet dans le fil d'Ariane et les liens
   « Ce projet » de la barre latérale.
   ============================================================ */
(function () {
  var KC = window.KC || {};
  var EN = KC.langue === 'en';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lire = function (u) { return fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  var p = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var IC = {
    dossier: p('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    doc: p('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    message: p('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.5-.7L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5Z"/>'),
    image: p('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2.5-2.5L20 17"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>')
  };

  // « Brief de la livraison 2/4 » (sur-mesure) ou « Brief de novembre » (abonnement)
  function nomBrief(d) {
    var M = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    var l = d && d.livraison;
    if (d && (d.abonnement || (l && l.type === 'abonnement'))) {
      var m = M[new Date(Date.parse(d.deadline || '') || Date.now()).getMonth()];
      return 'Brief ' + (/^[aeiouâ]/.test(m) ? "d'" : 'de ') + m;
    }
    if (l && l.sur > 1) return 'Brief de la livraison ' + l.n + '/' + l.sur;
    return 'Brief du client';
  }
  function nomProjet(d, dossier) {
    var l = d && d.livraison;
    return ((d && d.brand_name) || dossier) + (l && l.sur > 1 ? (EN ? ' · part ' : ' · livraison ') + l.n + '/' + l.sur : '');
  }
  function lien(href, icone, texte, on) {
    return '<a class="kc-l' + (on ? ' on' : '') + '" href="' + esc(href) + '">' + IC[icone] + '<span>' + esc(texte) + '</span></a>';
  }

  // ---------- le projet de la page ----------
  function projet() {
    var P = KC.projet;
    if (!P || !/^[A-Za-z0-9_-]+$/.test(P)) return;
    var t = KC.type;
    var demandes = [lire('/' + P + '/donnees.json'), lire('/' + P + '/envois.json')];
    if (KC.role !== 'designer') demandes.push(lire('/' + P + '/retour.json'));
    Promise.all(demandes).then(function (r) {
      var d = r[0], envois = r[1], retour = r[2];
      if (!d) return;
      var nom = nomProjet(d, P);
      if ($('kc-nom')) $('kc-nom').textContent = nom;
      if (t === 'retours' && $('kc-page')) $('kc-page').textContent = nomBrief(d);
      var aEnvoi = !!(envois && Array.isArray(envois.envois) && envois.envois.length);
      var h = '';
      if (KC.role === 'designer') {
        h = lien('/' + P + '/creas/', 'image', 'Preview', t === 'apercu') +
          lien('/' + P + '/creas/telecharger.html', 'telecharger', 'Download', t === 'telech');
      } else {
        var prod = (d.livraison && d.livraison.projet) || P;
        h = lien('/' + prod + '/', 'dossier', 'Dossier de production', t === 'dossier') +
          (retour && retour.dossier === P ? lien('/retours/?projet=' + encodeURIComponent(P), 'message', nomBrief(d), t === 'retours') : '') +
          lien('/fiche/?projet=' + encodeURIComponent(P), 'doc', 'Fiche créas', t === 'fiche') +
          (aEnvoi || t === 'apercu' || t === 'telech' ? lien('/' + P + '/creas/', 'image', 'Visuels', t === 'apercu' || t === 'telech') : '');
      }
      $('kc-projet-l').innerHTML = h;
      $('kc-projet').hidden = false;
    });
  }

  // ---------- la recherche ⌘K (dans les projets) ----------
  var PROJETS = null;
  function chargerProjets() {
    if (PROJETS) return Promise.resolve(PROJETS);
    return lire('/projets.json').then(function (l) {
      PROJETS = (Array.isArray(l) ? l : []).filter(function (x) { return x && x.dossier && !/^TEST_/i.test(x.dossier); });
      return PROJETS;
    });
  }
  function cible(x) {
    if (KC.role === 'designer') return { href: '/' + x.dossier + '/creas/', type: 'Preview' };
    if (KC.role === 'strategiste') return { href: '/fiche/?projet=' + encodeURIComponent(x.dossier), type: 'Fiche' };
    var prod = x.dossier;
    try { var m = new URL(x.url).pathname.replace(/^\/kreative-dossiers/, '').match(/^\/([A-Za-z0-9_-]+)\//); if (m) prod = m[1]; } catch (e) {}
    return { href: '/' + prod + '/', type: 'Dossier' };
  }
  function recherche() {
    var champ = $('kc-cherche'), res = $('kc-res');
    if (!champ) return;
    var sel = 0;
    function montrer() {
      var q = champ.value.trim().toLowerCase();
      if (!q) { res.hidden = true; return; }
      chargerProjets().then(function (l) {
        var items = l.filter(function (x) { return ((x.brand_name || '') + ' ' + x.dossier).toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
        sel = 0;
        res.innerHTML = items.length ? items.map(function (x, i) {
          var c = cible(x);
          return '<a href="' + esc(c.href) + '" class="' + (i === 0 ? 'sel' : '') + '">' + IC.dossier + '<span>' + esc(x.brand_name || x.dossier) +
            ' <span style="color:var(--kc-tx3)">· ' + esc(x.nb_creas || '?') + (EN ? ' creatives' : ' créas') + '</span></span><small>' + esc(c.type) + '</small></a>';
        }).join('') : '<div class="kc-rien">' + (EN ? 'No result' : 'Aucun résultat') + '</div>';
        res.hidden = false;
      });
    }
    champ.addEventListener('input', montrer);
    champ.addEventListener('focus', function () { chargerProjets(); });
    champ.addEventListener('keydown', function (e) {
      var liens = res.querySelectorAll('a');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!liens.length) return;
        liens[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + liens.length) % liens.length; liens[sel].classList.add('sel');
      }
      if (e.key === 'Enter' && liens[sel]) { e.preventDefault(); location.href = liens[sel].getAttribute('href'); }
      if (e.key === 'Escape') { res.hidden = true; champ.blur(); }
    });
    champ.addEventListener('blur', function () { setTimeout(function () { res.hidden = true; }, 150); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); champ.focus(); champ.select(); }
    });
  }

  // ---------- menus ----------
  function menus() {
    var kc = $('kc'), mb = $('kc-mb'), menu = $('kc-menu'), burger = $('kc-burger');
    if (mb) mb.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
    if (burger) burger.addEventListener('click', function (e) { e.stopPropagation(); kc.classList.toggle('menu-ouvert'); });
    document.addEventListener('click', function (e) {
      if (menu && !menu.hidden && !menu.contains(e.target)) menu.hidden = true;
      if (kc && kc.classList.contains('menu-ouvert') && !$('kc-side').contains(e.target)) kc.classList.remove('menu-ouvert');
    });
  }

  function demarrer() { if (!$('kc')) return; menus(); recherche(); projet(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

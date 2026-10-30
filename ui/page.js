/* ============================================================
   KREATIVE · PAGES DE PRODUCTION DANS LE PORTAIL
   Ajouté par le Worker à chaque page de l'équipe (dossier, fiche,
   brief, visuels, téléchargement), qu'elle soit ouverte dans le
   portail (cadre intégré) ou seule.
   1. Les liens vers une autre page de production restent dans le
      portail : plus de nouvel onglet.
   2. Dossier, section Assets : un bouton « Tout télécharger » par
      groupe (envoyés par le client, récupérés sur le site), et les
      images du site se téléchargent au lieu de s'ouvrir.
   ============================================================ */
(function () {
  var integre = document.body.classList.contains('kc-integre');

  // ---------- 0. démonstration : un projet TEST_DEMO_* ne prévient jamais personne ----------
  // (fiche envoyée, visuel signalé, livraison : fausse réponse « ok », rien ne part vers n8n)
  (function () {
    var f = window.fetch;
    if (!f || f.kDemo) return;
    var g = function (entree, init) {
      try {
        var u = new URL(typeof entree === 'string' ? entree : entree.url, location.href);
        var meth = String((init && init.method) || (entree && entree.method) || 'GET').toUpperCase();
        var corps = init && typeof init.body === 'string' ? init.body : '';
        if (u.origin !== location.origin && meth !== 'GET' &&
          (/TEST_DEMO_/.test(corps) || /TEST_DEMO_/.test(location.pathname + location.search) || /\.invalid$/.test(u.hostname))) {
          return Promise.resolve(new Response(JSON.stringify({ ok: true, demo: true, message: /^en/.test(document.documentElement.lang) ? 'Demo project: nothing was sent, nobody was notified.' : 'Démo : rien n\'a été envoyé, personne n\'est prévenu.' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      } catch (e) {}
      return f.apply(this, arguments);
    };
    g.kDemo = true;
    window.fetch = g;
  })();

  // ---------- 1. les liens internes restent dans le portail ----------
  function estPageInterne(u) {
    if (u.origin !== location.origin) return false;
    if (/\.(png|jpe?g|webp|gif|svg|zip|pdf|json|txt|mp4|mov|csv)$/i.test(u.pathname)) return false;
    if (/^\/(_telecharger|api\/)/.test(u.pathname)) return false;
    return true;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
    if (!estPageInterne(u)) return;
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return;   // ancre dans la page
    e.preventDefault();
    if (integre && window.parent !== window) window.parent.postMessage({ kreative: 'aller', chemin: u.pathname + u.search }, location.origin);
    else location.href = u.pathname + u.search;
  }, true);

  // ---------- 2. le dossier : téléchargements par groupe ----------
  function zipper(liens, nomZip, bouton) {
    if (typeof JSZip === 'undefined') { alert('La compression n\'a pas pu se charger. Téléchargez les fichiers un par un.'); return; }
    var lab = bouton.textContent; bouton.textContent = 'Préparation…'; bouton.disabled = true;
    var z = new JSZip(), rates = [];
    var suite = liens.reduce(function (p, l) {
      return p.then(function () {
        return fetch(l.url).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
          .then(function (b) { z.file(l.nom, b); }).catch(function () { rates.push(l.nom + ' : ' + l.source); });
      });
    }, Promise.resolve());
    suite.then(function () {
      if (rates.length) z.file('A_TELECHARGER_A_LA_MAIN.txt', 'Ces fichiers n\'ont pas pu être ajoutés au zip :\n\n' + rates.join('\n'));
      return z.generateAsync({ type: 'blob' });
    }).then(function (b) {
      var u = URL.createObjectURL(b), t = document.createElement('a');
      t.href = u; t.download = nomZip; document.body.appendChild(t); t.click(); t.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    }).finally(function () { bouton.textContent = lab; bouton.disabled = false; });
  }
  // un fichier intégré dans la page (data:) : son vrai type, lu dans ses premiers octets (le Moteur marque
  // tout en image/jpeg, même un logo SVG ou PNG), transformé en fichier local (blob:) pour le téléchargement
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4' };
  function depuisData(href) {
    try {
      var m = href.match(/^data:([^;,]*)(;base64)?,(.*)$/); if (!m) return null;
      var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), o = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) o[k] = bin.charCodeAt(k);
      var debut = bin.slice(0, 300), type = m[1] || 'application/octet-stream';
      if (debut.slice(0, 4) === '\x89PNG') type = 'image/png';
      else if (debut.slice(0, 3) === '\xFF\xD8\xFF') type = 'image/jpeg';
      else if (debut.slice(0, 4) === 'GIF8') type = 'image/gif';
      else if (debut.slice(0, 4) === 'RIFF' && debut.slice(8, 12) === 'WEBP') type = 'image/webp';
      else if (/^\s*(<\?xml[\s\S]*?)?<svg|<svg[\s>]/i.test(debut)) type = 'image/svg+xml';
      return { url: URL.createObjectURL(new Blob([o], { type: type })), type: type, ext: EXT[type] || 'bin' };
    } catch (x) { return null; }
  }
  function assets() {
    var section = document.getElementById('assets');
    if (!section) return;
    var marque = ((document.querySelector('.top h1, h1') || {}).textContent || 'client').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'client';
    var global = section.querySelector('#zip');
    var groupes = section.querySelectorAll('.sub');
    if (!groupes.length) return;
    if (global) global.style.display = 'none';
    Array.prototype.forEach.call(groupes, function (sub) {
      var grille = sub.nextElementSibling;
      while (grille && !grille.classList.contains('assets')) grille = grille.nextElementSibling;
      if (!grille) return;
      var site = /site/i.test(sub.textContent);
      var liens = [];
      Array.prototype.forEach.call(grille.querySelectorAll('.asset a[href]'), function (a, n) {
        var href = a.getAttribute('href'); if (!href || href === '#') return;
        var b = a.querySelector('.cap b'), code = b ? b.textContent.trim() : (site ? 'WS' : 'PJ') + String(n + 1).padStart(2, '0');
        if (/^data:/i.test(href)) {
          // intégré dans la page : téléchargé tel quel, avec la bonne extension, et l'aperçu réparé (SVG)
          var f = depuisData(href); if (!f) return;
          var nomD = code + '.' + f.ext, im = a.querySelector('img');
          a.setAttribute('href', f.url); a.setAttribute('download', nomD); a.removeAttribute('target');
          if (im && /^data:/i.test(im.getAttribute('src') || '')) im.setAttribute('src', f.url);
          liens.push({ url: f.url, nom: nomD, source: code + ' (fichier du client)' });
          return;
        }
        var ext = ((href.split('?')[0].match(/\.(png|jpe?g|webp|gif|svg|mp4)$/i) || [])[1] || 'png').toLowerCase();
        var nom = a.getAttribute('download') || (code + '.' + ext);
        var abs = new URL(href, location.href);
        var url = abs.origin === location.origin ? abs.toString() : '/_telecharger?u=' + encodeURIComponent(abs.toString()) + '&nom=' + encodeURIComponent(nom);
        if (abs.origin !== location.origin) {
          // l'image du site se télécharge, comme celles du client
          a.setAttribute('href', url); a.setAttribute('download', nom); a.removeAttribute('target');
          var s = a.querySelector('.cap small'); if (s) s.textContent = 'télécharger';
        }
        liens.push({ url: url, nom: nom, source: abs.toString() });
      });
      if (!liens.length) return;
      sub.style.display = 'flex'; sub.style.alignItems = 'center'; sub.style.gap = '14px';
      var bouton = document.createElement('button');
      bouton.type = 'button'; bouton.className = 'dl kp-tout';
      bouton.textContent = 'Tout télécharger (' + liens.length + ')';
      bouton.onclick = function () { zipper(liens, marque + (site ? '-assets-site' : '-assets-client') + '.zip', bouton); };
      sub.appendChild(bouton);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', assets); else assets();
})();

/* Kreative · aperçu designer
   Ajoute sous chaque visuel un lien « Signaler un problème sur le visuel ».
   La demande part à Kreative, qui décide. */
(function () {
  var WEBHOOK = 'https://n8n.srv1536015.hstgr.cloud/webhook/regeneration';
  var parties = location.pathname.split('/').filter(Boolean);
  var i = parties.indexOf('creas');
  var DOSSIER = i > 0 ? parties[i - 1] : '';
  if (!DOSSIER) return;

  var css = document.createElement('style');
  css.textContent =
    '.sig{margin-top:auto;padding-top:18px;width:100%}' +
    '.sig-b{background:none;border:0;padding:0;color:#9E9B92;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}' +
    '.sig-b:hover{color:#0A1B33}' +
    '.sig-f{border:1px solid #E4E1D8;border-radius:12px;padding:14px 16px;margin-top:10px;background:#FAF9F6}' +
    '.sig-t{margin:0 0 8px;font-size:13.5px;font-weight:600}' +
    '.sig-f label{display:block;font-size:13.5px;color:#5D6472;margin:4px 0;cursor:pointer}' +
    '.sig-f textarea{width:100%;margin-top:8px;border:1px solid #E4E1D8;border-radius:9px;padding:8px 10px;font:inherit;font-size:13.5px;resize:vertical;box-sizing:border-box}' +
    '.sig-a{display:flex;gap:10px;margin-top:10px}' +
    '.sig-e{padding:8px 14px;border:0;border-radius:9px;background:#0A1B33;color:#fff;font:inherit;font-size:13.5px;cursor:pointer}' +
    '.sig-e:disabled{opacity:.55;cursor:default}' +
    '.sig-x{background:none;border:0;color:#9E9B92;font:inherit;font-size:13.5px;cursor:pointer}' +
    '.sig-r{margin:10px 0 0;font-size:13.5px;color:#5D6472}';
  document.head.appendChild(css);

  var MOTIFS = ['Logo déformé ou faux', 'Texte faux ou illisible', 'Élément mal placé ou coupé', 'Visuel inutilisable'];
  var ERREUR = 'La demande n\'est pas passée. Préviens Kreative sur Telegram.';

  document.querySelectorAll('article.c').forEach(function (carte) {
    var img = carte.querySelector('.im img');
    var num = carte.querySelector('.num');
    var tx = carte.querySelector('.tx');
    if (!img || !num || !tx) return;

    /* les visuels peuvent être remplacés : on contourne le cache */
    img.src = img.src.split('?')[0] + '?v=' + Date.now();

    var crea = num.textContent.trim();
    var z = document.createElement('div');
    z.className = 'sig';
    z.innerHTML =
      '<button class="sig-b" type="button">Signaler un problème sur le visuel</button>' +
      '<form class="sig-f" hidden><p class="sig-t">Qu\'est-ce qui ne va pas ?</p>' +
      MOTIFS.map(function (m) { return '<label><input type="checkbox" value="' + m + '"> ' + m + '</label>'; }).join('') +
      '<textarea rows="2" placeholder="Précise en une phrase (facultatif)"></textarea>' +
      '<div class="sig-a"><button class="sig-e" type="submit">Envoyer à Kreative</button>' +
      '<button class="sig-x" type="button">Annuler</button></div></form>' +
      '<p class="sig-r" hidden></p>';
    tx.appendChild(z);

    var b = z.querySelector('.sig-b'), f = z.querySelector('.sig-f'), r = z.querySelector('.sig-r');
    b.onclick = function () { f.hidden = false; b.hidden = true; r.hidden = true; };
    z.querySelector('.sig-x').onclick = function () { f.hidden = true; b.hidden = false; };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var motifs = Array.prototype.map.call(f.querySelectorAll('input:checked'), function (x) { return x.value; });
      var commentaire = f.querySelector('textarea').value.trim();
      if (!motifs.length && !commentaire) { r.hidden = false; r.textContent = 'Coche au moins une case ou précise le problème.'; return; }
      var e = f.querySelector('.sig-e');
      e.disabled = true; e.textContent = 'Envoi…';
      fetch(WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier: DOSSIER, crea: crea, motifs: motifs, commentaire: commentaire })
      }).then(function (rep) {
        return rep.json().catch(function () { return {}; }).then(function (j) {
          return (j && j.message) ? j.message : (rep.ok ? 'Demande envoyée à Kreative. Tu seras prévenu sur Telegram.' : ERREUR);
        });
      }).catch(function () { return ERREUR; }).then(function (msg) {
        f.hidden = true; r.hidden = false; r.textContent = msg;
        e.disabled = false; e.textContent = 'Envoyer à Kreative';
      });
    };
  });
})();

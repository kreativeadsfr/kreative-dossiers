// 30/10 : un commentaire mal placé dans ui/app.js a bloqué tout le portail sur « Chargement… ».
// Ce test lit chaque script du portail (fichiers .js et scripts écrits dans les pages) et vérifie qu'il se lit sans erreur.
import fs from 'node:fs'; import vm from 'node:vm';
const R = new URL('../../', import.meta.url).pathname;
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const lire = (code, nom) => { try { new vm.Script(code, { filename: nom }); return ''; } catch (e) { return e.message; } };
for (const f of fs.readdirSync(R + 'ui').filter(f => f.endsWith('.js'))) { const e = lire(fs.readFileSync(R + 'ui/' + f, 'utf8'), f); t('ui/' + f, !e, e); }
for (const p of ['admin/index.html', 'client/index.html', 'client/wimmov.html', 'client/connexion.html', 'studio/index.html', 'strategiste/index.html', 'designer/index.html', 'commander/index.html', 'merci/index.html', 'fiche/index.html', 'admin/wimmov.html']) {
  if (!fs.existsSync(R + p)) continue;
  const h = fs.readFileSync(R + p, 'utf8'); let n = 0, err = '';
  for (const m of h.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="(?:application\/(?:ld\+)?json|text\/template)")[^>]*>([\s\S]*?)<\/script>/g)) { n++; const e = lire(m[1], p + ' #' + n); if (e) err += ' script ' + n + ' : ' + e; }
  t(p + ' (' + n + ' scripts)', !err, err);
}
const w = lire(fs.readFileSync(R + 'outils/cloudflare/worker.js', 'utf8').replace(/^export default/m, 'const _x ='), 'worker.js'); t('worker.js', !w, w);
// 13/11 (Wimmov) : une facture Stripe à 0 € (date d'abonnement déplacée, « essai gratuit ») ne s'affiche ni chez le client ni dans l'admin
for (const [p, nom] of [['admin/index.html', 'facturesPayees'], ['client/index.html', 'payees'], ['client/wimmov.html', 'payees']]) {
  const l = fs.readFileSync(R + p, 'utf8').match(new RegExp('const ' + nom + ' = (F => .*?);(?:\\s|$)', 'm'));
  const f = l && vm.runInNewContext('(' + l[1] + ')');
  const F = [{ id: 'a', source: 'stripe', statut: 'payee', montant: 1200 }, { id: 'b', source: 'stripe', statut: 'payee', montant: 0 }, { id: 'c', source: 'manuelle', statut: 'payee', montant: 50 }, { id: 'd', source: 'stripe', statut: 'ouverte', montant: 90 }];
  t(p + ' : facture Stripe à 0 € cachée', f && f(F).map(x => x.id).join() === 'a,c', l ? JSON.stringify(f && f(F)) : 'introuvable');
}
console.log(`\n${ok} OK, ${ko} en échec`);

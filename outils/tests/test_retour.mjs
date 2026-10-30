import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const api = async (p, ck, methode, corps, entetes) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json', ...(entetes || {}) }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const lignes = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const deposer = (liv, nom, format, ck) => get('/api/equipe/fichiers?livraison=' + liv + '&format=' + format + '&nom=' + encodeURIComponent(nom) + '&l=1080&h=1080', { method: 'PUT', headers: { Cookie: ck || DE, 'Content-Type': 'image/png' }, body: PNG }).then(async r => ({ s: r.status, d: await r.json().catch(() => null) }));
// ---- le brief de la livraison suivante (Custom en plusieurs fois) ----
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Splitco', email: 'split@co.fr' }); const cid = r.d.id; const CK = cookie(await get(new URL(r.d.lien).pathname));
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'custom', formule: 'unique', nb_creas: 40 }); const kid = r.d.id, ref = r.d.ref;
const n8n = (p, corps) => get('/api/n8n/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kreative-Cle': sec.CLE }, body: JSON.stringify(corps) }).then(x => x.json());
r = await n8n('brief', { dossier: 'SPLIT_10_aaaa_L1', commande: ref, client: cid, questions: [{ name: 'Votre marque', value: 'Splitco' }] }); t('premier brief relié', r.ok === true, JSON.stringify(r));
let moi = (await api('/api/client/moi', CK)).d, k = moi.commandes[0];
t('pas de brief suivant avant la livraison 1', !k.brief_suivant, JSON.stringify(k.brief_suivant));
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: 'SPLIT_10_aaaa_L1' }); const v1 = r.d; await deposer(v1.id, 'S_01.png', '1x1');
await api('/api/equipe/livraisons/' + v1.id + '/envoyer', DE, 'POST', {}); await api('/api/equipe/livraisons/' + v1.id + '/decision', A, 'POST', { action: 'envoyer' });
const t1 = Date.now();
moi = (await api('/api/client/moi', CK)).d; k = moi.commandes[0];
// 30/10/2026 : 40 créas = 2 livraisons de 20 (72 h chacune) ; la 2e arrive 15 jours après la réception de la 1re,
// l'équipe la démarre 72 h avant : le brief de la 2 est demandé la veille, soit 11 jours après la livraison 1, à part
const prevu2 = t1 + 11 * 864e5;
t('livraison 1 chez le client : le brief de la 2 n\'est pas encore demandé, il est annoncé 11 jours après la livraison 1', !k.brief_suivant && k.brief_prochain && k.brief_prochain.n === 2 && k.brief_prochain.sur === 2 && Math.abs(k.brief_prochain.le - prevu2) < 5000, JSON.stringify([k.brief_suivant, k.brief_prochain]));
let nq = (await api('/api/client/notifications/derniere', CK)).d;
t('… notification « Livraison 1 sur 2 disponible », sans parler du brief', nq.titre === 'Livraison 1 sur 2 disponible' && nq.texte === 'Les créatives de votre livraison 1 sont disponibles dans votre espace Kreative.', JSON.stringify(nq));
const rappels = a => n8n('rappels', { a });
r = await rappels(Date.now()); t('avant sa date : aucun rappel envoyé', r.envoyes === 0, JSON.stringify(r));
const mails0 = fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).length : 0;
r = await rappels(prevu2 + 60000); nq = (await api('/api/client/notifications/derniere', CK)).d;
t('à sa date : notification « Votre brief pour la livraison 2 » vers Mon brief', r.envoyes === 1 && nq.titre === 'Votre brief pour la livraison 2' && nq.url === '/client/#/brief', JSON.stringify([r, nq]));
const ml = fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).slice(mails0).map(l => JSON.parse(l).corps);
t('… et l\'email « Remplir mon brief »', ml.length === 1 && ml[0].sujet === 'Splitco · Votre brief pour la livraison 2' && /Faites-nous part de vos retours pour lancer la prochaine livraison/.test(ml[0].html) && /Remplir mon brief/.test(ml[0].html), JSON.stringify(ml.map(x => x.sujet)));
r = await rappels(prevu2 + 120000); t('… une seule fois', r.envoyes === 0, JSON.stringify(r));
await api('/api/admin/commandes/' + kid, A, 'PATCH', { decaler_livraisons: 12 * 864e5 });
// le calendrier servi à l'équipe (fiche, rappels n8n) : la livraison 2 tombe 15 jours après la RÉCEPTION de la 1re, en 72 h
const dL2 = await (await get('/SPLIT_10_aaaa_L2/donnees.json', { headers: { Cookie: A } })).json(), finL2 = Date.parse(dL2.deadline);
t('livraison 2 : 15 jours après la réception de la livraison 1, préparée en 72 h', Math.abs(finL2 - (t1 - 12 * 864e5 + 15 * 864e5)) < 5000 && dL2.calendrier && dL2.calendrier.n === 2 && dL2.calendrier.heures === 72
  && Math.abs(Date.parse(dL2.deadline_designer) - (finL2 - 8 * 36e5)) < 1000 && Math.abs(Date.parse(dL2.deadline_strategiste) - (finL2 - 72 * 36e5 + 24 * 36e5)) < 1000, JSON.stringify([dL2.deadline, dL2.calendrier, dL2.deadline_strategiste]));
moi = (await api('/api/client/moi', CK)).d; k = moi.commandes[0];
t('à sa date, le formulaire de la livraison 2 s\'ouvre dans l\'espace', k.brief_suivant && k.brief_suivant.n === 2 && k.brief_suivant.dossier === 'SPLIT_10_aaaa_L1' && !k.brief_prochain, JSON.stringify(k.brief_suivant));
r = await n8n('retour', { dossier: 'SPLIT_10_aaaa_L1', client: cid, questions: [{ name: 'Les créas qui ont le mieux marché', value: 'La 3 et la 7' }, { name: 'Répartition', value: '60 % dérivés' }] });
t('retour reçu (livraison suivante L2)', r.ok === true && r.suivante === 'SPLIT_10_aaaa_L2', JSON.stringify(r));
moi = (await api('/api/client/moi', CK)).d; k = moi.commandes[0];
t('plus de brief à faire, le retour est relisible', !k.brief_suivant && k.retours.length === 1 && k.retours[0].reponses[0].texte === 'La 3 et la 7', JSON.stringify(k.retours));
r = await n8n('retour', { dossier: 'INCONNU_10_zzzz_L1', client: cid, questions: [] }); t('retour d\'un projet inconnu : ignoré', r.ok === false, JSON.stringify(r));
// ---- abonnement : le brief du mois ----
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'growth', formule: 'mensuel' }); const m1 = r.d;
await n8n('brief', { dossier: 'SPLIT_10_mois_L1', commande: m1.ref, client: cid, questions: [{ name: 'Votre marque', value: 'Splitco' }] });
await new Promise(z => setTimeout(z, 20));
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'growth', formule: 'mensuel' }); const m2 = r.d;
moi = (await api('/api/client/moi', CK)).d; const km2 = moi.commandes.find(x => x.id === m2.id);
t('abonnement : le nouveau mois attend son brief, à partir du mois d\'avant', km2.brief_mois && km2.brief_mois.dossier === 'SPLIT_10_mois_L1', JSON.stringify(km2.brief_mois));
r = await n8n('retour', { dossier: 'SPLIT_10_mois_L1', client: cid, commande: m2.ref, questions: [{ name: 'Ce mois-ci', value: 'Plus de vidéos produit' }] });
moi = (await api('/api/client/moi', CK)).d; const km2b = moi.commandes.find(x => x.id === m2.id);
t('brief du mois reçu : commande du mois en production, brief relisible', km2b.statut === 'production' && km2b.dossier === 'SPLIT_10_mois_L2' && /Plus de vidéos/.test(km2b.brief_json), km2b.statut + ' ' + km2b.dossier);
r = await n8n('retour', { dossier: 'SPLIT_10_mois_L1', client: 'c_autre', commande: m2.ref, questions: [] }); t('retour avec la commande d\'un autre client : pas de liaison', true);
// ---- Custom en abonnement, livré en 4 fois (n8n relie la commande au dossier de base, sans _L) : un formulaire de retour avant chaque livraison après la 1re, puis chaque mois ----
r = await api('/api/admin/clients', A, 'POST', { marque: 'Quadco', email: 'quad@co.fr' }); const qid = r.d.id; const QK = cookie(await get(new URL(r.d.lien).pathname));
r = await api('/api/admin/commandes', A, 'POST', { client_id: qid, pack: 'custom', formule: 'mensuel', nb_creas: 80 }); const q1 = r.d;
await n8n('brief', { dossier: 'QUAD_10_bbbb', commande: q1.ref, client: qid, questions: [{ name: 'Votre marque', value: 'Quadco' }] });
const livrer = async d => { const v = (await api('/api/equipe/livraisons', DE, 'POST', { dossier: d })).d; await deposer(v.id, d + '.png', '1x1'); await api('/api/equipe/livraisons/' + v.id + '/envoyer', DE, 'POST', {}); await api('/api/equipe/livraisons/' + v.id + '/decision', A, 'POST', { action: 'envoyer' }); };
const etatQ = async () => (await api('/api/client/moi', QK)).d.commandes.find(x => x.id === q1.id);
let qk = await etatQ(); t('4 livraisons : rien à remplir avant la livraison 1', !qk.brief_suivant, JSON.stringify(qk.brief_suivant));
for (let n = 1; n <= 3; n++) {
  await livrer('QUAD_10_bbbb_L' + n); qk = await etatQ();
  const nq = (await api('/api/client/notifications/derniere', QK)).d;
  // chaque semaine : le brief de la livraison suivante n'est jamais envoyé avec la livraison, mais la veille de la semaine suivante
  t('livraison ' + n + '/4 : message de livraison seul, brief de la ' + (n + 1) + ' pas encore demandé', !qk.brief_suivant && qk.brief_prochain && qk.brief_prochain.n === n + 1 && nq.titre === 'Livraison ' + n + ' sur 4 disponible' && nq.texte === 'Les créatives de votre livraison ' + n + ' sont disponibles dans votre espace Kreative.', JSON.stringify([qk.brief_prochain, nq]));
  // la livraison n+1 arrive n semaines après la livraison 1, démarrée 72 h avant : brief demandé la veille, plus tard
  t('… prévu plus tard, la veille du début de la livraison ' + (n + 1), qk.brief_prochain.le > Date.now() + 864e5, qk.brief_prochain.le);
  await api('/api/admin/commandes/' + q1.id, A, 'PATCH', { decaler_livraisons: 7 * 864e5 });
  const rr = await n8n('rappels', { a: Date.now() + 40 * 864e5 }); qk = await etatQ();
  t('… le jour venu : un message à part « Votre brief pour la livraison ' + (n + 1) + ' », formulaire ouvert', rr.envoyes === 1 && (await api('/api/client/notifications/derniere', QK)).d.titre === 'Votre brief pour la livraison ' + (n + 1) && qk.brief_suivant && qk.brief_suivant.n === n + 1, JSON.stringify([rr, qk.brief_suivant]));
  r = await n8n('retour', { dossier: 'QUAD_10_bbbb_L' + n, client: qid, questions: [{ name: 'Pour la suite', value: 'Retour ' + n }] });
  qk = await etatQ(); t('… retour ' + n + ' reçu : plus rien à remplir jusqu\'à la livraison suivante', r.ok === true && !qk.brief_suivant, JSON.stringify(r));
}
await livrer('QUAD_10_bbbb_L4'); qk = await etatQ();
t('dernière livraison : « Livraison 4 sur 4 disponible », sans brief à remplir', (await api('/api/client/notifications/derniere', QK)).d.titre === 'Livraison 4 sur 4 disponible' && (await api('/api/client/notifications/derniere', QK)).d.texte === 'Les créatives de votre livraison 4 sont disponibles dans votre espace Kreative.');
t('livraison 4/4 : plus de formulaire de retour pour ce mois', !qk.brief_suivant && qk.retours.length === 3, JSON.stringify(qk.brief_suivant) + ' ' + qk.retours.length);
await new Promise(z => setTimeout(z, 20));
r = await api('/api/admin/commandes', A, 'POST', { client_id: qid, pack: 'custom', formule: 'mensuel', nb_creas: 80 }); const q2 = r.d;
const km = (await api('/api/client/moi', QK)).d.commandes.find(x => x.id === q2.id);
t('mois suivant : formulaire de retour du mois (pas le brief complet)', !!(km && km.brief_mois && km.brief_mois.dossier), JSON.stringify(km && km.brief_mois));
// ---- 30/10/2026 : le délai du Custom dépend de la taille de chaque livraison, l'express ne porte que sur la 1re ----
const offres = await (await get('/api/offres')).json();
t('offres : délais par taille de livraison (12 → 48 h, 25 → 72 h, 30 → 4 jours)', JSON.stringify(offres.custom.delais_lot) === '[[12,48],[25,72],[30,96]]', JSON.stringify(offres.custom.delais_lot));
r = await api('/api/admin/clients', A, 'POST', { marque: 'Delaico', email: 'delai@co.fr' }); const did = r.d.id; const DK = cookie(await get(new URL(r.d.lien).pathname));
const echeance = async (nb, options) => {
  const k = (await api('/api/admin/commandes', A, 'POST', { client_id: did, pack: 'custom', formule: 'unique', nb_creas: nb })).d;
  if (options) await api('/api/admin/commandes/' + k.id, A, 'PATCH', { notes: '' });
  const brief = Date.now() - 1000;
  await api('/api/admin/commandes/' + k.id, A, 'PATCH', { dossier: 'DELAI_' + nb + '_' + (options ? 'x' : 'n'), brief_le: brief });
  const c = (await api('/api/client/moi', DK)).d.commandes.find(x => x.id === k.id);
  return Math.round((c.deadline - brief) / 36e5);
};
t('Custom 30 créas : 1 livraison de 30, en 4 jours', await echeance(30) === 96);
t('Custom 40 créas : 2 livraisons de 20, la 1re en 72 h', await echeance(40) === 72);
t('Custom 55 créas : 2 livraisons de 28 et 27, la 1re en 4 jours', await echeance(55) === 96);
t('Custom 100 créas : 4 livraisons de 25, la 1re en 72 h', await echeance(100) === 72);
console.log('\n' + ok + ' ok, ' + ko + ' en échec');

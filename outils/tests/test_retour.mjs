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
moi = (await api('/api/client/moi', CK)).d; k = moi.commandes[0];
t('livraison 1 chez le client : brief de la livraison 2 demandé', k.brief_suivant && k.brief_suivant.n === 2 && k.brief_suivant.dossier === 'SPLIT_10_aaaa_L1', JSON.stringify(k.brief_suivant));
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
console.log('\n' + ok + ' ok, ' + ko + ' en échec');

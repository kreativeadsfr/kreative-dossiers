import fs from 'node:fs';
import { createRequire } from 'node:module';
// v84 : un client avec deux projets (deux marques : Pack Marque A + Pack Marque B, 5 créas chacun, un brief chacun)
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario');
const api = async (p, ck, methode, corps, entetes) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json', ...(entetes || {}) }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };

let r = await api('/api/admin/diagnostic', A); t('diagnostic : Worker v86', r.d && r.d.worker === 'v86', JSON.stringify(r.d && r.d.worker));
r = await api('/api/admin/clients', A, 'POST', { marque: 'Deux Marques', contact: 'Léa Martin', email: 'lea@deuxmarques.test' }); const cid = r.d.id; const lien = new URL(r.d.lien).pathname;
// la commande payée (Custom 10 créas, 200 €) devient le projet Marque A : 5 créas, 100 €
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'custom', formule: 'unique', nb_creas: 10, prix: 200 }); const k1 = r.d;
r = await api('/api/admin/commandes/' + k1.id, A, 'PATCH', { nom: 'Pack Marque A', nb_creas: 5, prix: 100 }); t('commande renommée « Pack Marque A », 5 créas', r.s === 200, JSON.stringify(r.d));
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'custom', formule: 'unique', nb_creas: 5, prix: 100, nom: 'Pack Marque B' }); const k2 = r.d;
t('2e projet créé avec son nom', r.s === 200 && !!k2.ref, JSON.stringify(r.d));
r = await api('/api/admin/clients/' + cid, A); const C = r.d.commandes;
t('admin : les deux projets, nommés, 5 créas chacun', C.length === 2 && C.some(c => c.nom === 'Pack Marque A' && c.nb_creas === 5 && c.prix === 100) && C.some(c => c.nom === 'Pack Marque B' && c.nb_creas === 5), JSON.stringify(C.map(c => [c.nom, c.nb_creas, c.prix])));
const CK = cookie(await get(lien));
r = await api('/api/client/moi', CK); const M = r.d.commandes;
t('espace client : deux projets, chacun son brief à remplir', M.length === 2 && M.every(c => c.statut === 'brief' && c.nb_creas === 5) && M.map(c => c.nom).sort().join('|') === 'Pack Marque A|Pack Marque B', JSON.stringify(M.map(c => [c.nom, c.statut, c.nb_creas])));
// la page du client : deux projets, deux briefs, le bon nom envoyé à Fillout
const req = createRequire(import.meta.url); const { chromium } = req('playwright');
const nav = await chromium.launch(); const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage(); const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(B + lien); await pg.waitForSelector('.projets', { timeout: 15000 });
const txt = await pg.textContent('body');
t('Accueil : « Pack Marque A » et « Pack Marque B »', /Pack Marque A/.test(txt) && /Pack Marque B/.test(txt), txt.slice(0, 300));
await pg.goto(B + '/client/#/brief'); await pg.waitForSelector('iframe', { timeout: 15000 });
const chips = await pg.$$eval('.bp a', l => l.map(x => x.textContent));
const src = await pg.getAttribute('iframe', 'src');
t('Mon brief : un onglet par projet', chips.length === 2 && chips.some(x => /Marque A/.test(x)) && chips.some(x => /Marque B/.test(x)), JSON.stringify(chips));
t('questionnaire Starter avec 5 créas et le nom du projet', /hSWiGFjTVhus/.test(src) && /creas=5/.test(src) && /marque=(Marque\+A|Marque\+B)/.test(src), src);
await pg.screenshot({ path: process.env.CAPTURE || '/tmp/projets.png' });
t('aucune erreur JavaScript', !erreurs.length, erreurs.join(' | '));
await nav.close();
// chaque brief relie son propre dossier
await api('/api/n8n/brief', '', 'POST', { dossier: 'MARQUEA_11_aaaa', commande: k1.ref, client: cid }, { 'X-Kreative-Cle': sec.CLE });
await api('/api/n8n/brief', '', 'POST', { dossier: 'MARQUEB_11_bbbb', commande: k2.ref, client: cid }, { 'X-Kreative-Cle': sec.CLE });
r = await api('/api/admin/clients/' + cid, A); const C2 = r.d.commandes;
t('chaque brief va dans son projet', C2.find(c => c.id === k1.id).dossier === 'MARQUEA_11_aaaa' && C2.find(c => c.id === k2.id).dossier === 'MARQUEB_11_bbbb', JSON.stringify(C2.map(c => [c.nom, c.dossier])));
// nom vidé : le nom automatique revient
await api('/api/admin/commandes/' + k2.id, A, 'PATCH', { nom: '' });
r = await api('/api/admin/clients/' + cid, A); t('nom vidé : nom automatique', r.d.commandes.find(c => c.id === k2.id).nom === null, JSON.stringify(r.d.commandes.find(c => c.id === k2.id).nom));
await api('/api/admin/commandes/' + k2.id, A, 'PATCH', { nom: 'Pack Marque B' });

console.log('\n' + ok + ' ok, ' + ko + ' en échec');

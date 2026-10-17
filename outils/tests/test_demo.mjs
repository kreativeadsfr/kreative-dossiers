import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const lignes = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };

// un vrai client existe avant la démo : il ne doit jamais être touché
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Vrai Client', email: 'vrai@client.fr' });
const vrai = r.d.id;
await api('/api/admin/commandes', A, 'POST', { client_id: vrai, pack: 'growth', formule: 'unique' });
const emails0 = lignes('emails.log'), stripe0 = lignes('stripe.log');

r = await api('/api/admin/demo', ST, 'POST'); t('démo refusée au stratégiste', r.s === 403, r.s);
r = await api('/api/admin/demo', DE, 'POST'); t('démo refusée à la designer', r.s === 403, r.s);
r = await api('/api/admin/demo', A, 'POST'); t('ajouter la démo : 9 clients, 10 commandes', r.s === 200 && r.d.clients === 9 && r.d.commandes === 10, JSON.stringify(r.d));
r = await api('/api/equipe/etats', ST);
t('les options du client (A/B tests, express) arrivent chez le stratégiste et la designer', r.s === 200 && r.d.options && r.d.options.TEST_DEMO_LUMEN === 'ab_visuel:2,ab_texte:3' && r.d.options.TEST_DEMO_VELVO === 'express,ab_texte:4' && (await api('/api/equipe/etats', DE)).d.options.TEST_DEMO_LUMEN === 'ab_visuel:2,ab_texte:3', JSON.stringify(r.d && r.d.options));
r = await api('/api/admin/demo', A, 'POST'); t('rajouter la démo ne double rien', r.d.clients === 9, JSON.stringify(r.d));
r = await api('/api/admin/clients', A); const demos = r.d.filter(c => c.id.startsWith('c_demo_'));
t('9 clients de démo + le vrai client', demos.length === 9 && r.d.some(c => c.id === vrai), r.d.length);
t('tous en @example.com et marqués (démo)', demos.every(c => /@example\.com$/.test(c.email) && /\(démo\)$/.test(c.marque)));
r = await api('/api/admin/resume', A); t('résumé : demo = 9', r.d.demo === 9, JSON.stringify(r.d.demo));
r = await api('/api/admin/factures', A); r.d = r.d.factures; t('10 factures de démo, toutes payées', r.d.filter(f => f.id.startsWith('f_demo_')).length === 10 && r.d.every(f => f.statut === 'payee'), r.d.length);

// chaque étape est représentée, avec le bon statut lu par le portail
const attendu = { lina: 'brief', lumen: 'production', sable: 'production', nordik: 'production', velvo: 'production', oria: 'production', pulse: 'livre', brume: 'revisions' };
for (const [slug, st] of Object.entries(attendu)) {
  r = await api('/api/admin/clients/c_demo_' + slug, A);
  t('démo ' + slug + ' : ' + st, r.s === 200 && r.d.commandes[0].statut === st, r.s + ' ' + (r.d && r.d.commandes && r.d.commandes.map(k => k.statut)));
}
r = await api('/api/admin/clients/c_demo_kora', A);
t('Kora : 2 commandes mensuelles (validée + en cours)', r.d.commandes.length === 2 && r.d.commandes.some(k => k.statut === 'valide') && r.d.commandes.some(k => k.statut === 'production'), JSON.stringify(r.d.commandes.map(k => k.statut)));
r = await api('/api/admin/clients/c_demo_pulse', A);
t('Pulse : étape livraison faite, validation pas encore', r.d.commandes[0].etapes[3].fait && !r.d.commandes[0].etapes[4].fait, JSON.stringify(r.d.commandes[0].etapes.map(e => e.fait)));

// l'aperçu du client de démo (comme l'admin le voit)
r = await api('/api/admin/clients/c_demo_lina', A);
const lien = (r.d.client && r.d.client.lien) || '';
t('lien d\'accès du client de démo', /\/acces\//.test(lien), JSON.stringify(Object.keys(r.d)));
const acc = await get(new URL(lien).pathname); const CK = cookie(acc);
r = await api('/api/client/moi', CK); t('le client de démo ouvre son portail', r.s === 200 && r.d.client.marque.includes('Lina'), r.s);
r = await api('/api/client/paiement', CK, 'POST', { pack: 'custom', formule: 'unique', nb_creas: 40, options: [] });
t('client de démo : paiement refusé, rien vers Stripe', r.s === 403 && lignes('stripe.log') === stripe0, r.s + ' ' + lignes('stripe.log'));
r = await get('/_lien', { method: 'POST', body: new URLSearchParams({ email: 'demo-lina@example.com' }) });
r = await api('/api/admin/clients/c_demo_lina/envoyer-lien', A, 'POST');
await new Promise(z => setTimeout(z, 600));
t('aucun email envoyé à un client de démo', lignes('emails.log') === emails0, lignes('emails.log') - emails0);

// les projets du dépôt
for (const d of ['TEST_DEMO_LUMEN', 'TEST_DEMO_NORDIK', 'TEST_DEMO_VELVO', 'TEST_DEMO_PULSE']) {
  r = await get('/' + d + '/', { headers: { Cookie: A, 'Sec-Fetch-Dest': 'iframe' } }); const h = await r.text();
  t(d + ' : dossier servi', r.status === 200 && h.includes('/ui/page.js'), r.status);
}
r = await get('/TEST_DEMO_VELVO/creas/', { headers: { Cookie: DE, 'Sec-Fetch-Dest': 'iframe' } }); let h = await r.text();
t('visuels Velvo pour la designer, sans adresse n8n', r.status === 200 && !h.includes('hstgr.cloud/webhook') && h.includes('demo.invalid'), r.status);
r = await get('/TEST_DEMO_NORDIK_L2/retour.json', { headers: { Cookie: ST } }); t('brief livraison 2 Nordik lisible', r.status === 200, r.status);
r = await get('/projets.json', { headers: { Cookie: A } }); const pj = await r.json();
t('8 projets de démo dans projets.json', pj.filter(x => x.demo).length === 8, pj.filter(x => x.demo).length);
r = await get('/ui/app.js'); h = await r.text(); t('garde démo dans app.js', h.includes('TEST_DEMO_') && h.includes('kDemo'));
r = await get('/ui/page.js', { headers: { Cookie: A } }); h = await r.text(); t('garde démo dans page.js', h.includes('TEST_DEMO_') && h.includes('kDemo'));

// retirer : seul le vrai client reste, intact
r = await api('/api/admin/demo', A, 'DELETE'); t('retirer la démo', r.s === 200 && r.d.retires === 9, JSON.stringify(r.d));
r = await api('/api/admin/clients', A); t('plus aucun client de démo, le vrai client est là', !r.d.some(c => c.id.startsWith('c_demo_')) && r.d.some(c => c.id === vrai), r.d.map(c => c.id));
r = await api('/api/admin/clients/' + vrai, A); t('sa commande est intacte', r.d.commandes.length === 1, r.d.commandes.length);
r = await api('/api/admin/factures', A); r.d = r.d.factures; t('plus de facture de démo', !r.d.some(f => f.id.startsWith('f_demo_')));
r = await api('/api/admin/commandes', A); t('plus de commande de démo', !r.d.some(k => k.id.startsWith('k_demo_')));
r = await api('/api/admin/resume', A); t('résumé : demo = 0', r.d.demo === 0, r.d.demo);
r = await api('/api/admin/clients/' + vrai, A, 'DELETE');

console.log('\n' + ok + ' ok, ' + ko + ' en échec');
process.exit(ko ? 1 : 0);

// Wimmov paie son lien Stripe sans que Kreative ait créé l'espace avant :
// l'espace se crée tout seul au paiement, et Hugo reçoit son lien d'accès.
// Usage : node test_wimmov_paiement.mjs config-test.json  (depuis outils/tests)
import fs from 'node:fs'; import crypto from 'node:crypto';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
const A = cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES.dario, suite: '/' }) }));
const api = async (p, ck) => { const r = await get(p, { headers: { Cookie: ck } }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const webhook = async ev => {
  const corps = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test_faux').update(ts + '.' + corps).digest('hex');
  return (await get('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=' + ts + ',v1=' + sig, 'Content-Type': 'application/json' }, body: corps })).status;
};
const emails = () => fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).corps) : [];
fs.rmSync('emails.log', { force: true });

t('avant le paiement : aucun espace Wimmov', (await api('/api/admin/wimmov', A)).s !== 200 || !(await api('/api/admin/wimmov', A)).d.client);
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_w0', mode: 'subscription', payment_status: 'paid', amount_total: 120000, customer: 'cus_w0',
  subscription: 'sub_w0', payment_link: 'plink_1UJxUZBaFgfyJZxjJCQHpo2g', metadata: {},
  customer_details: { email: 'Hugo.Perso@gmail.com', business_name: 'Wimmov' } } } });
await new Promise(x => setTimeout(x, 400));
const r = await api('/api/admin/wimmov', A);
t('payé avec une adresse Gmail : l\'espace Wimmov se crée quand même', r.s === 200 && r.d.client && r.d.client.email === 'hugo.perso@gmail.com' && r.d.client.marque === 'Wimmov' && r.d.client.contact === 'Hugo Raffaelli', JSON.stringify(r.d && r.d.client));
t('… avec son 1er mois : 60 créas, en production', r.d.commandes.length === 1 && r.d.commandes[0].nb_creas === 60 && r.d.commandes[0].statut === 'production', JSON.stringify(r.d.commandes));
const E = emails().filter(e => e.type === 'acces');
t('… Hugo reçoit son lien d\'accès, « Bonjour Hugo, »', E.length === 1 && E[0].a === 'hugo.perso@gmail.com' && /Bonjour Hugo,/.test(E[0].html) && /retours de la semaine/.test(E[0].html), JSON.stringify(emails()).slice(0, 300));
t('… pas d\'email de brief', !emails().some(e => /brief/i.test(e.sujet || '')));
const lien = (E[0].html.match(/href="([^"]+\/acces\/[^"]+)"/) || [])[1] || '';
const W = cookie(await get(lien.replace(/^https?:\/\/[^/]+/, '')));
const h = await (await get('/client/', { headers: { Cookie: W } })).text();
t('le lien ouvre l\'espace Wimmov', h.includes('Espace Wimmov'), lien);
const S = cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES.strategiste, suite: '/' }) }));
t('la stratégiste ne voit pas ce mois', !JSON.stringify((await api('/api/equipe/etats', S)).d).includes('WIMMOV_'));
// le mois suivant payé avec son adresse @wimmov.com : même espace, pas un 2e
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_w1', mode: 'payment', payment_status: 'paid', amount_total: 18000, customer: 'cus_w1',
  payment_link: 'plink_1UJxUZBaFgfyJZxjJCQHpo2g', metadata: {}, customer_details: { email: 'hugo.raffaelli@wimmov.com', business_name: 'Wimmov SAS' } } } });
const r2 = await api('/api/admin/wimmov', A), tous = (await api('/api/admin/clients', A)).d;
t('un paiement avec son adresse @wimmov.com va dans le même espace', r2.d.client.id === r.d.client.id && r2.d.commandes.length === 2 && (tous.clients || tous).length === 1, JSON.stringify(tous).slice(0, 200));
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

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
import crypto from 'node:crypto';
// ---- l'app : installation, notifications ----
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Appco', email: 'app@co.fr' }); const cid = r.d.id; const CK = cookie(await get(new URL(r.d.lien).pathname));
r = await get('/client/manifest.webmanifest'); const man = await r.json();
t('manifeste public (nom, icônes, plein écran)', r.status === 200 && man.name === 'Kreative' && man.display === 'standalone' && man.icons.length === 3, JSON.stringify(man).slice(0, 100));
r = await get('/client/sw.js'); t('service worker public', r.status === 200 && /showNotification/.test(await r.text()), r.status);
r = await get('/app-icon-192.png'); t('icône de l\'app publique', r.status === 200 && r.headers.get('content-type') === 'image/png', r.status);
r = await api('/api/client/app', CK, 'POST'); let cl = (await api('/api/admin/clients', A)).d.find(c => c.id === cid);
t('ouverte depuis l\'écran d\'accueil : « App » dans l\'admin', !!cl.app_le && !cl.notifs, JSON.stringify({ app: cl.app_le, n: cl.notifs }));
r = await api('/api/client/push/cle', CK); const cle = r.d.cle; t('clé publique VAPID (65 octets)', Buffer.from(cle, 'base64url').length === 65, cle);
r = await api('/api/client/push/cle', CK); t('… toujours la même', r.d.cle === cle);
r = await api('/api/client/push', CK, 'POST', { subscription: { endpoint: 'http://pirate.example/x' } }); t('abonnement à une adresse douteuse refusé', r.s === 400, r.s);
r = await api('/api/client/push', CK, 'POST', { subscription: { endpoint: 'http://127.0.0.1:9911/push/tel1' } }); t('abonnement aux notifications', r.s === 200, r.s);
await api('/api/client/push', CK, 'POST', { subscription: { endpoint: 'http://127.0.0.1:9911/push/perime' } });
cl = (await api('/api/admin/clients', A)).d.find(c => c.id === cid); t('… « notifs » dans l\'admin', cl.notifs === 2, cl.notifs);
// une livraison envoyée réveille le téléphone
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'growth', formule: 'unique', dossier: 'APPCO_10_aaaa' });
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: 'APPCO_10_aaaa' }); const v = r.d; await deposer(v.id, 'A_01.png', '1x1');
await api('/api/equipe/livraisons/' + v.id + '/envoyer', DE, 'POST', {}); await api('/api/equipe/livraisons/' + v.id + '/decision', A, 'POST', { action: 'envoyer' });
await new Promise(z => setTimeout(z, 500));
const P = lignes('push.log').map(l => JSON.parse(l)), p1 = P.find(x => x.chemin === '/push/tel1');
t('livraison envoyée : le téléphone est réveillé (Web Push, TTL 24 h)', !!p1 && p1.ttl === '86400' && /^vapid t=.+, k=/.test(p1.auth), JSON.stringify(P).slice(0, 200));
const [, jwt, k] = p1.auth.match(/^vapid t=([^,]+), k=(.+)$/), [h64, c64, s64] = jwt.split('.');
const claims = JSON.parse(Buffer.from(c64, 'base64url'));
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(k, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(k, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
const sigOk = crypto.verify('sha256', Buffer.from(h64 + '.' + c64), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url'));
t('jeton VAPID valide (signature ES256, audience, expiration)', sigOk && claims.aud === 'http://127.0.0.1:9911' && claims.exp > Date.now() / 1000 && /^mailto:/.test(claims.sub), JSON.stringify(claims));
r = await api('/api/client/notifications/derniere', CK); t('l\'app lit la notification : « Vos créatives sont prêtes »', r.d.titre === 'Vos créatives sont prêtes' && /creatives$/.test(r.d.url), JSON.stringify(r.d));
cl = (await api('/api/admin/clients', A)).d.find(c => c.id === cid); t('abonnement périmé (410) retiré tout seul', cl.notifs === 1, cl.notifs);
// une promo depuis l'admin
r = await api('/api/admin/notifier', A, 'POST', { titre: '−20 % pendant 48 h', texte: 'Code KREATIVE20 sur votre prochain pack.', url: '/client/#/commander' });
t('promo envoyée aux clients qui ont les notifications', r.s === 200 && r.d.clients === 1 && r.d.appareils === 1, JSON.stringify(r.d));
r = await api('/api/client/notifications/derniere', CK); t('… et l\'app l\'affiche', r.d.titre === '−20 % pendant 48 h' && r.d.url === '/client/#/commander', JSON.stringify(r.d));
r = await api('/api/admin/notifier', A, 'POST', { titre: 'x', texte: 'y', url: 'https://pirate.example' }); r = await api('/api/client/notifications/derniere', CK);
t('un lien extérieur est remplacé par l\'espace client', r.d.url === '/client/', r.d.url);
r = await api('/api/admin/notifier', ST, 'POST', { titre: 'x', texte: 'y' }); t('seul l\'admin envoie des notifications', r.s === 403, r.s);
// une sélection de clients
r = await api('/api/admin/clients', A, 'POST', { marque: 'Sans App', contact: 'Zoé', email: 'zoe' + Date.now() + '@sansapp.fr' }); const autre = r.d.id;
r = await api('/api/admin/notifier', A, 'POST', { titre: 'Pour toi', texte: 'Sélection', clients: [cid, autre] });
t('sélection : seuls les cochés qui ont les notifs la reçoivent', r.s === 200 && r.d.clients === 1, JSON.stringify(r.d));
r = await api('/api/client/notifications/derniere', CK); t('… et l\'app l\'affiche', r.d.titre === 'Pour toi', JSON.stringify(r.d));
r = await api('/api/admin/notifier', A, 'POST', { titre: 'Pas pour toi', texte: 'x', clients: [autre] });
t('client décoché : rien reçu', r.s === 200 && r.d.clients === 0 && (await api('/api/client/notifications/derniere', CK)).d.titre === 'Pour toi', JSON.stringify(r.d));
r = await api('/api/admin/notifier', A, 'POST', { titre: 'x', texte: 'y', clients: [] }); t('sélection vide refusée', r.s === 400, r.s);
// l'app de l'admin (Windows, Mac, téléphone) : son propre manifeste, lisible sans être connecté
let ma = await get('/admin/manifest.webmanifest'), mj = await ma.json();
t('app admin : manifeste public « Kreative Admin », ouvre /admin/', ma.status === 200 && mj.name === 'Kreative Admin' && mj.start_url === '/admin/' && mj.scope === '/admin/' && mj.icons.length === 3 && mj.display === 'standalone', JSON.stringify(mj));
t('app admin : service worker public, limité à /admin/', (await get('/admin/sw.js')).status === 200 && (await get('/admin/sw.js')).headers.get('service-worker-allowed') === '/admin/');
const mc = await (await get('/client/manifest.webmanifest')).json();
t('app admin : ses propres icônes (Windows arrondie, téléphone noire)', mj.icons.every(i => /app-icon-admin-/.test(i.src)) && (await Promise.all(mj.icons.map(i => get(i.src)))).every(r => r.status === 200), JSON.stringify(mj.icons));
t('… et l\'iPhone prend l\'icône noire', (await get('/app-icon-admin-apple.png')).status === 200);
t('l\'app des clients garde ses icônes', mc.icons.every(i => !/admin/.test(i.src)));
t('l\'app des clients ne change pas', mc.name === 'Kreative' && mc.start_url === '/client/?app=1' && mc.scope === '/client/', JSON.stringify(mc));
t('l\'admin reste fermé sans connexion', [302, 303].includes((await get('/admin/')).status));
// 30/10 : une facture payée ne renvoie plus au PDF Stripe (« à régler », « Payer en ligne ») mais à un PDF « payée » fait ici
const appjs = await (await get('/ui/app.js', { headers: { Cookie: A } })).text();
t('facture payée : PDF du portail marqué payée, pas le PDF Stripe', /if \(f\.pdf && !payee\)/.test(appjs) && /payés le/.test(appjs) && /Reste à payer/.test(appjs) && /TVA non applicable, art\. 293 B du CGI/.test(appjs));
// 30/10 : la page Équipe montre la dernière connexion de chacun (au plus une écriture toutes les 5 min)
await get('/admin/', { headers: { Cookie: A } }); await new Promise(z => setTimeout(z, 300));
const eq = (await api('/api/admin/equipe', A)).d, dario = eq.find(p => p.nom === 'dario');
t('équipe : dernière connexion de Dario connue', dario && dario.vu_le > Date.now() - 6e4, JSON.stringify(dario));
t('équipe : pas de mot de passe dans la réponse', !JSON.stringify(eq).includes(sec.ACCES.dario), 'mdp visible');
console.log('\n' + ok + ' ok, ' + ko + ' en échec');

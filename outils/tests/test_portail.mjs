import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };

// accès
let r = await api('/api/admin/clients', ''); t('API admin sans connexion → 403', r.s === 403, r.s);
r = await api('/api/admin/clients', ST); t('API admin refusée au stratégiste', r.s === 403, r.s);
r = await api('/api/admin/clients', DE); t('API admin refusée au designer', r.s === 403, r.s);
r = await get('/client/'); t('portail sans connexion → page de connexion client', r.status === 302 && r.headers.get('location') === '/client/connexion', r.status + ' ' + r.headers.get('location'));
r = await get('/client/connexion'); let h = await r.text(); t('page de connexion client publique', r.status === 200 && h.includes('Recevoir mon lien'), r.status);
r = await get('/ui/app.css'); t('app.css public', r.status === 200, r.status);

// clients
r = await api('/api/admin/clients', A); t('liste clients vide', r.s === 200 && Array.isArray(r.d) && r.d.length === 0, JSON.stringify(r.d));
r = await api('/api/admin/clients', A, 'POST', { marque: '' }); t('marque obligatoire', r.s === 400, r.s);
r = await api('/api/admin/clients', A, 'POST', { marque: 'Turnly', contact: 'Léa Martin', email: 'Lea@Turnly.fr', telephone: '0612', site: 'https://turnly.fr' });
t('création client', r.s === 200 && r.d.id && r.d.lien.startsWith(B + '/acces/'), JSON.stringify(r.d));
const id = r.d.id, lien = r.d.lien;
r = await api('/api/admin/clients', A, 'POST', { marque: 'Doublon', email: 'lea@turnly.fr' }); t('email en double refusé', r.s === 409, r.s);
r = await api('/api/admin/commandes', A, 'POST', { client_id: id, pack: 'growth', formule: 'mensuel' });
t('commande créée (#1001, prix mensuel 420)', r.s === 200 && r.d.ref === '1001', JSON.stringify(r.d));
const kid = r.d.id;
r = await api('/api/admin/commandes', A, 'POST', { client_id: id, pack: 'starter', formule: 'unique', dossier: 'TURNLY_10_bc5e' });
t('2e commande avec dossier (#1002)', r.d.ref === '1002', JSON.stringify(r.d));
r = await api('/api/admin/clients/' + id, A);
const k1 = r.d.commandes.find(x => x.ref === '1001'), k2 = r.d.commandes.find(x => x.ref === '1002');
t('fiche client : 2 commandes, prix 420', r.s === 200 && r.d.commandes.length === 2 && k1.prix === 420, JSON.stringify(r.d.commandes.map(x => [x.ref, x.prix])));
t('commande sans dossier : brief attendu', k1.statut === 'brief' && k1.etapes[1].fait === false, k1.statut);
t('commande avec dossier : brief envoyé et production finie (designer a livré, lu dans le dépôt), 3/5', k2.statut === 'production' && k2.etapes.filter(e => e.fait).length === 3 && k2.progression === 60 && k2.etapes.length === 6 && k2.etapes[5].option, JSON.stringify(k2.etapes.map(e => e.fait)) + ' ' + k2.progression);
r = await api('/api/admin/commandes/' + kid, A, 'PATCH', { dossier: 'TURNLY_10_f665_L2' }); t('relier un dossier', r.s === 200, r.s);
r = await api('/api/admin/clients/' + id, A); const k1b = r.d.commandes.find(x => x.ref === '1001');
t('dossier relié → production + activité « Brief reçu »', k1b.statut === 'production' && r.d.activite.some(a => a.texte.startsWith('Brief reçu')), k1b.statut);
r = await api('/api/admin/commandes/' + kid, A, 'PATCH', { statut: 'nimporte' }); t('statut inconnu refusé', r.s === 400, r.s);
r = await api('/api/admin/commandes/' + kid, A, 'PATCH', { statut: 'livre' }); t('passer en livré', r.s === 200, r.s);

// emails et liens
r = await api('/api/admin/clients/' + id + '/envoyer-lien', A, 'POST');
const mails = fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').map(JSON.parse) : [];
t('lien envoyé par email via n8n (avec la clé)', r.s === 200 && mails.length === 1 && mails[0].corps.a === 'lea@turnly.fr' && mails[0].corps.lien === lien && mails[0].cle === sec.CLE, JSON.stringify(mails));
r = await api('/api/client/lien', '', 'POST', { email: 'LEA@turnly.fr' }); await new Promise(x => setTimeout(x, 300));
const mails2 = fs.readFileSync('emails.log', 'utf8').trim().split('\n');
t('le client redemande son lien (majuscules acceptées)', r.s === 200 && mails2.length === 2, mails2.length);
r = await api('/api/client/lien', '', 'POST', { email: 'inconnu@x.fr' });
t('email inconnu : même réponse, aucun envoi', r.s === 200 && /Si cette adresse/.test(r.d.message) && fs.readFileSync('emails.log', 'utf8').trim().split('\n').length === 2);

// le client
r = await get(lien.replace(B, '')); const CK = cookie(r);
t('lien personnel → cookie client + espace', r.status === 302 && r.headers.get('location') === '/client/' && CK.startsWith('k_client=' + id), r.status + ' ' + CK);
r = await api('/api/client/moi', CK);
t('/api/client/moi : marque, 2 commandes, activité', r.s === 200 && r.d.client.marque === 'Turnly' && r.d.commandes.length === 2 && r.d.activite.length > 2 && r.d.apercu === false, JSON.stringify(r.d && r.d.client));
t('le client ne voit pas le lien ni les notes', !('jeton' in r.d.client) && !('notes' in r.d.client), Object.keys(r.d.client).join(','));
r = await get('/client/', { headers: { Cookie: CK } }); h = await r.text(); t('portail servi au client', r.status === 200 && h.includes('Espace client'), r.status);
r = await get('/client/projets', { headers: { Cookie: CK } }); t('toute adresse /client/… sert le portail', r.status === 200, r.status);
for (const p of ['/fiche/', '/projets.json', '/TURNLY_10_bc5e/donnees.json', '/admin/', '/strategiste/'])
  { r = await get(p, { headers: { Cookie: CK } }); t('client bloqué sur ' + p, r.status === 302 || r.status === 401, r.status); }
r = await api('/api/admin/clients', CK); t('client bloqué sur l\'API admin', r.s === 403, r.s);
r = await get('/acces/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'); t('faux lien → connexion avec message', r.headers.get('location') === '/client/connexion?lien=invalide', r.headers.get('location'));

// aperçu admin, nouveau lien, blocage
r = await api('/api/client/moi?client=' + id, A); t('aperçu admin de l\'espace client', r.s === 200 && r.d.apercu === true && r.d.client.id === id, r.s);
r = await api('/api/client/moi?client=' + id, ST); t('aperçu refusé au stratégiste', r.s === 401, r.s);
r = await api('/api/admin/clients/' + id + '/nouveau-lien', A, 'POST'); t('nouveau lien', r.s === 200 && r.d.lien !== lien, '');
r = await get(lien.replace(B, '')); t('l\'ancien lien ne marche plus', r.headers.get('location') === '/client/connexion?lien=invalide', r.headers.get('location'));
r = await api('/api/admin/clients/' + id, A, 'PATCH', { statut: 'bloque' });
r = await api('/api/client/moi', CK); t('client bloqué : session coupée', r.s === 401, r.s);
r = await api('/api/admin/clients/' + id, A, 'PATCH', { statut: 'actif' });
r = await api('/api/client/moi', CK); t('débloqué : il revient', r.s === 200, r.s);
r = await get('/client/sortie', { headers: { Cookie: CK } }); t('déconnexion client', r.status === 303 && /Max-Age=0/.test(r.headers.get('set-cookie')), r.status);

r = await api('/api/admin/resume', A); t('résumé admin', r.s === 200 && r.d.clients === 1 && r.d.en_cours === 2 && r.d.mensuels === 1, JSON.stringify(r.d).slice(0, 120));
r = await api('/api/admin/equipe', A); t('équipe (sans mots de passe)', r.s === 200 && r.d.length === 3 && !JSON.stringify(r.d).includes(sec.ACCES.dario), JSON.stringify(r.d));
r = await api('/api/admin/commandes', A); t('liste des commandes', r.s === 200 && r.d.length === 2 && r.d[0].marque === 'Turnly', r.s);
console.log('\n' + ok + ' OK, ' + ko + ' en échec');
console.log('CLIENT_ID=' + id);

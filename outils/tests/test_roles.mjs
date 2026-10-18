import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
async function connecter(qui, suite = '/') {
  const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite }) });
  return { ck: { headers: { Cookie: (r.headers.get('set-cookie') || '').split(';')[0] } }, lieu: r.headers.get('location') };
}
const statut = async (p, C) => { const r = await get(p, C); return r.status + (r.headers.get('location') ? ' ' + r.headers.get('location') : ''); };

// ---- arrivée de chacun
let a = await connecter('dario'); t('Dario arrive sur le tableau de bord', a.lieu === '/admin/', a.lieu);
let s = await connecter('strategiste'); t('le stratégiste arrive sur son espace', s.lieu === '/strategiste/', s.lieu);
let d = await connecter('andrea'); t('Andrea arrive sur son espace', d.lieu === '/designer/', d.lieu);
d = await connecter('andrea', '/fiche/'); t('Andrea qui visait la fiche → son espace', d.lieu === '/designer/', d.lieu);
t('racine → espace de chacun', (await statut('/', a.ck)) === '302 /admin/' && (await statut('/', s.ck)) === '302 /strategiste/' && (await statut('/', d.ck)) === '302 /designer/');

// ---- Andrea (designer)
for (const p of ['/designer/', '/TURNLY_10_bc5e/creas/', '/TURNLY_10_bc5e/creas/telecharger.html', '/projets.json', '/TURNLY_10_bc5e/donnees.json', '/TURNLY_10_bc5e/envois.json', '/signaler.js', '/ui/kreative.css'])
  t('designer peut ouvrir ' + p, (await statut(p, d.ck)).startsWith('200'), await statut(p, d.ck));
for (const [p, attendu] of [['/strategiste/', '302 /designer/'], ['/fiche/', '302 /designer/'], ['/TURNLY_10_bc5e/', '302 /designer/'], ['/retours/?projet=TURNLY_10_f665_L2', '302 /designer/'], ['/admin/', '302 /designer/'], ['/_admin/dossiers.json', '403'], ['/TURNLY_10_f665_L2/retour.json', '403'], ['/README.md', '403']])
  t('designer bloqué sur ' + p, (await statut(p, d.ck)) === attendu, await statut(p, d.ck));

// ---- stratégiste
for (const p of ['/strategiste/', '/fiche/', '/TURNLY_10_bc5e/', '/retours/?projet=TURNLY_10_f665_L2', '/TURNLY_10_f665_L2/retour.json', '/TURNLY_10_bc5e/creas/'])
  t('stratégiste peut ouvrir ' + p, (await statut(p, s.ck)).startsWith('200'), await statut(p, s.ck));
for (const [p, attendu] of [['/designer/', '302 /strategiste/'], ['/designer', '302 /strategiste/'], ['/admin/', '302 /strategiste/'], ['/_admin/dossiers.json', '403']])
  t('stratégiste bloqué sur ' + p, (await statut(p, s.ck)) === attendu, await statut(p, s.ck));

// ---- admin
for (const p of ['/admin/', '/strategiste/', '/designer/', '/fiche/', '/TURNLY_10_bc5e/', '/TURNLY_10_bc5e/creas/', '/retours/?projet=TURNLY_10_f665_L2', '/README.md'])
  t('admin peut ouvrir ' + p, (await statut(p, a.ck)).startsWith('200'), await statut(p, a.ck));
let r = await get('/_admin/dossiers.json', a.ck); let l = await r.json();
t('admin : liste de tous les dossiers', Array.isArray(l) && l.includes('LABORATOIREKOT_09_c6ac') && !l.includes('ui') && !l.includes('fiche'), JSON.stringify(l).slice(0, 120));
r = await get('/_moi', a.ck); t('/_moi', JSON.stringify(await r.json()) === '{"nom":"dario","role":"admin","accueil":"/admin/"}');

// ---- tout s'ouvre dans le portail
const coq = h => h.includes('id="kc"') && h.includes('/ui/coquille.css') && h.includes('id="kc-scroll"');
const doc = ck => ({ headers: { ...ck.headers, 'Sec-Fetch-Dest': 'document' } });
let h = await (await get('/TURNLY_10_bc5e/', a.ck)).text(); t('page seule (vieux navigateur) : coquille de secours', coq(h) && h.includes('Vue d&#39;ensemble') && /<body class="k k-dossier kc-on kc-shell kc-dossier"/.test(h) && h.includes('/ui/page.js'));
t('plus de barre noire ni de section « Ce projet » qui apparaît', !h.includes('k-barre') && !h.includes('id="kc-projet"'));
let r0 = await get('/TURNLY_10_bc5e/', doc(s.ck)); t('dossier ouvert depuis un lien → dans le portail du stratégiste', r0.status === 302 && r0.headers.get('location') === '/strategiste/#/dossier/TURNLY_10_bc5e', r0.headers.get('location'));
r0 = await get('/fiche/?projet=SENSEFRAGRANCE_10_7cf1', doc(a.ck)); t('fiche ouverte par l\'admin → dans l\'admin', r0.headers.get('location') === '/admin/#/fiche/SENSEFRAGRANCE_10_7cf1', r0.headers.get('location'));
r0 = await get('/retours/?projet=TURNLY_10_f665_L2', doc(s.ck)); t('brief → section Briefs clients', r0.headers.get('location') === '/strategiste/#/brief/TURNLY_10_f665_L2', r0.headers.get('location'));
r0 = await get('/TURNLY_10_bc5e/creas/', doc(d.ck)); t('visuels pour la designer → Previews', r0.headers.get('location') === '/designer/#/visuels/TURNLY_10_bc5e', r0.headers.get('location'));
r0 = await get('/TURNLY_10_bc5e/creas/telecharger.html', doc(d.ck)); t('téléchargement → Downloads', r0.headers.get('location') === '/designer/#/telechargement/TURNLY_10_bc5e', r0.headers.get('location'));
h = await (await get('/TURNLY_10_bc5e/?integre=1', doc(s.ck))).text(); t('dans le cadre du portail : la page seule, sans barre latérale', !h.includes('id="kc"') && /kc-on kc-integre kc-dossier/.test(h) && h.includes('/ui/page.js'));
h = await (await get('/fiche/?projet=SENSEFRAGRANCE_10_7cf1', { headers: { ...s.ck.headers, 'Sec-Fetch-Dest': 'iframe' } })).text(); t('cadre détecté par le navigateur aussi', !h.includes('id="kc"') && h.includes('kc-integre'));
h = await (await get('/strategiste/', doc(a.ck))).text(); t('espace stratégiste : le portail lui-même (pas de redirection, pas de coquille ajoutée)', !h.includes('id="kc"') && h.includes('K.prod') && h.includes('Fiches créas'));
h = await (await get('/designer/', doc(d.ck))).text(); t('espace designer : le portail, en anglais', !h.includes('id="kc"') && h.includes('Previews') && h.includes('Deliver'));
h = await (await get('/admin/', a.ck)).text(); t('pas de coquille ajoutée au tableau de bord (il a la sienne)', !h.includes('id="kc"'));
r0 = await get('/admin/', doc(a.ck)); t('le tableau de bord ne se redirige pas sur lui-même', r0.status === 200, r0.status);
r0 = await get('/client/connexion', { headers: { 'Sec-Fetch-Dest': 'document' } }); t('la connexion client non plus', r0.status === 200, r0.status);
h = await (await get('/fiche/', s.ck)).text(); t('stratégiste : coquille de secours sans les liens admin', coq(h) && h.includes('Fiches créas') && !h.includes('Nouveau client') && !h.includes('/admin/'));
r0 = await get('/_telecharger?u=' + encodeURIComponent('http://127.0.0.1:9911/x.png'), s.ck); t('le relais de téléchargement refuse les adresses internes', r0.status === 400, r0.status);
r0 = await get('/_telecharger?u=x', d.ck); t('relais de téléchargement interdit à la designer', r0.status === 302 || r0.status === 403, r0.status);
r0 = await get('/_telecharger?u=x'); t('relais de téléchargement : connexion requise', r0.status === 401 || r0.status === 302, r0.status);
r = await get('/TURNLY_10_bc5e/donnees.json', s.ck); h = await r.text(); t('les fichiers JSON ne reçoivent pas la coquille', !h.includes('id="kc"') && h.trim().startsWith('{'));
r = await get('/_n8n/' + sec.CLE + '/TURNLY_10_bc5e/index.html'); h = await r.text(); t('n8n lit les pages sans coquille', r.status === 200 && !h.includes('id="kc"'));
r = await get('/admin/ancien.html', a.ck); t('ancien tableau de bord retiré', r.status === 404, r.status);
r = await get('/TURNLY_10_bc5e/nexiste.html', s.ck); h = await r.text(); t('404 propre avec retour à l\'espace', r.status === 404 && h.includes('Retour à mon espace') && h.includes('/strategiste/'));

// ---- accès retiré / rôle inconnu
r = await get('/designer/', { headers: { Cookie: 'k_espace=evan.' + (Date.now() + 1e9) + '.x' } }); t('session inconnue refusée', r.status === 302);

// ---- la fiche créas envoyée depuis le portail : plus de code à taper, le Worker ajoute le sien
{
  const envoi = (ck, corps) => get('/api/equipe/fiche', { method: 'POST', headers: { ...(ck ? ck.headers : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const LOG = new URL('fiche.log', import.meta.url);
  try { fs.unlinkSync(LOG); } catch (e) {}
  let rf = await envoi(s.ck, { dossier: 'TURNLY_10_bc5e', code: '', creas: [{ n: 1 }] }); let jf = await rf.json();
  t('fiche envoyée par le stratégiste sans code : acceptée', rf.status === 200 && jf.ok === true, rf.status + ' ' + JSON.stringify(jf));
  const recu = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8').trim().split('\n').pop()) : {};
  t('le Worker ajoute le code Kreative et garde la fiche', recu.code === 'code-fiche-test' && recu.dossier === 'TURNLY_10_bc5e' && recu.creas && recu.creas.length === 1, JSON.stringify(recu).slice(0, 120));
  rf = await envoi(s.ck, { dossier: 'TURNLY_10_bc5e', code: 'faux-code-tape' }); t('un code tapé à la main est ignoré (celui du Worker gagne)', rf.status === 200);
  rf = await envoi(a.ck, { dossier: 'TURNLY_10_bc5e' }); t('Dario peut aussi envoyer une fiche', rf.status === 200);
  rf = await envoi(d.ck, { dossier: 'TURNLY_10_bc5e' }); t('la designer ne peut pas envoyer de fiche', rf.status === 403);
  rf = await envoi(null, { dossier: 'TURNLY_10_bc5e' }); t('sans session : refusé', rf.status === 403);
  rf = await envoi(s.ck, { dossier: '../x' }); t('dossier invalide refusé', rf.status === 400);
  const pf = await (await get('/fiche/', s.ck)).text(); t('la fiche du portail part par /api/equipe/fiche', pf.includes('"/api/equipe/fiche"') && pf.includes('const PORTAIL'));
  t('la fiche ne demande plus jamais de code', !/prompt\(|codeKreative|Code Kreative/.test(pf));
  t('l\'adresse n8n n\'est plus dans la fiche', !pf.includes('n8n.srv1536015'));
}
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

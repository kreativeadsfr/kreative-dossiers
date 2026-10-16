import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const api = async (p, ck, methode, corps, entetes) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json', ...(entetes || {}) }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const lignes = f => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } };
// une petite image PNG (1x1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const deposer = (liv, nom, format, ck) => get('/api/equipe/fichiers?livraison=' + liv + '&format=' + format + '&nom=' + encodeURIComponent(nom) + '&l=1080&h=1080', { method: 'PUT', headers: { Cookie: ck || DE, 'Content-Type': 'image/png' }, body: PNG }).then(async r => ({ s: r.status, d: await r.json().catch(() => null) }));

// un client, sa commande reliée au dossier TURNLY_10_bc5e
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Nova', contact: 'Inès Durand', email: 'ines@nova.fr' }); const cid = r.d.id;
const acces = await get(new URL(r.d.lien).pathname); const CK = cookie(acces);
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'growth', formule: 'unique', dossier: 'TURNLY_10_bc5e' }); const kid = r.d.id;
r = await api('/api/admin/clients', A, 'POST', { marque: 'Autre', email: 'autre@client.fr' }); const CK2 = cookie(await get(new URL(r.d.lien).pathname));

// droits
r = await api('/api/equipe/livraisons', ST); t('API livraisons refusée au stratégiste', r.s === 403, r.s);
r = await api('/api/equipe/livraisons', CK); t('API livraisons refusée au client', r.s === 403, r.s);

// la designer dépose la version 1
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: 'TURNLY_10_bc5e' }); const v1 = r.d;
t('version 1 créée (brouillon)', r.s === 200 && v1.version === 1 && v1.statut === 'brouillon', JSON.stringify(r.d));
r = await deposer(v1.id, 'NOVA_STANDARD_01.png', '1x1'); const f1 = r.d.id; t('fichier déposé dans le stockage', r.s === 200 && /^fi_/.test(f1), JSON.stringify(r.d));
r = await deposer(v1.id, 'NOVA_FEED_01.png', '4x5'); t('2e fichier (4:5)', r.s === 200);
r = await get('/api/equipe/fichiers/' + f1 + '/mini', { method: 'PUT', headers: { Cookie: DE, 'Content-Type': 'image/jpeg' }, body: PNG }); t('miniature déposée', r.status === 200, r.status);
r = await get('/api/equipe/fichiers?livraison=' + v1.id + '&format=1x1&nom=x.txt', { method: 'PUT', headers: { Cookie: DE, 'Content-Type': 'image/jpeg' }, body: 'x' }); t('un JPG est refusé (PNG seulement)', r.status === 415, r.status);
r = await get('/fichiers/' + f1, { headers: { Cookie: CK } }); t('le client ne voit pas un brouillon', r.status === 403, r.status);
r = await api('/api/client/commandes/' + kid + '/creatives', CK); t('rien côté client avant l\'envoi de Kreative', r.s === 200 && r.d.livraisons.length === 0, JSON.stringify(r.d));
r = await api('/api/equipe/livraisons/' + v1.id + '/envoyer', DE, 'POST', { note: 'Tout est là' });
await new Promise(z => setTimeout(z, 400));
const lv = lignes('livraison.log').map(l => JSON.parse(l));
t('envoyée à Kreative : n8n prévenu avec le lien de vérification', r.s === 200 && lv.length === 1 && lv[0].dossier === 'TURNLY_10_bc5e' && /\/admin\/#\/livraisons\/TURNLY_10_bc5e$/.test(lv[0].lien), JSON.stringify(lv));
r = await deposer(v1.id, 'NOVA_REELS_01.png', '9x16'); t('plus de dépôt pendant la vérification', r.s === 409, r.s);
r = await api('/api/equipe/livraisons/' + v1.id + '/decision', DE, 'POST', { action: 'envoyer' }); t('la designer ne peut pas envoyer au client', r.s === 403, r.s);

// Kreative renvoie à la designer
r = await api('/api/equipe/livraisons/' + v1.id + '/decision', A, 'POST', { action: 'corriger', note: 'Le logo est flou' }); t('renvoyée à la designer', r.s === 200);
r = await api('/api/equipe/commentaires', A, 'POST', { fichier_id: f1, texte: 'Logo flou ici', forme: { t: 'rect', x1: .1, y1: .1, x2: .3, y2: .2 }, couleur: '#e5484d' }); t('commentaire interne de Kreative', r.s === 200);
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: 'TURNLY_10_bc5e' }); const v2 = r.d;
t('version 2 : reprend les 2 fichiers de la version 1', v2.version === 2 && v2.fichiers.length === 2, JSON.stringify(r.d && r.d.fichiers && r.d.fichiers.length));
r = await deposer(v2.id, 'NOVA_STANDARD_01.png', '1x1'); const f2 = r.d.id;
r = await api('/api/equipe/livraisons/TURNLY_10_bc5e', DE); const vv2 = r.d.versions.find(v => v.id === v2.id);
t('même nom : le fichier est remplacé (toujours 2 fichiers)', vv2.fichiers.length === 2 && vv2.fichiers.some(f => f.id === f2), vv2.fichiers.length);
t('la designer voit la note et le commentaire de Kreative sur la version 1', r.d.versions.find(v => v.id === v1.id).note_kreative === 'Le logo est flou' && r.d.versions.find(v => v.id === v1.id).fichiers.find(f => f.id === f1).commentaires.length === 1);
r = await api('/api/equipe/livraisons/' + v2.id + '/envoyer', DE, 'POST', {});
const avantMails = lignes('emails.log').length;
r = await api('/api/equipe/livraisons/' + v2.id + '/decision', A, 'POST', { action: 'envoyer' }); t('Kreative envoie au client', r.s === 200, JSON.stringify(r.d));
await new Promise(z => setTimeout(z, 400));
const mail = lignes('emails.log').slice(avantMails).map(l => JSON.parse(l).corps).pop() || {};
t('le client reçoit un email « nouvelle version » avec le HTML', mail.a === 'ines@nova.fr' && /nouvelle version/.test(mail.sujet) && /Voir mes créatives/.test(mail.html), JSON.stringify(mail).slice(0, 200));
r = await api('/api/admin/clients/' + cid, A); t('commande passée en « livré »', r.d.commandes[0].statut === 'livre', r.d.commandes[0].statut);
r = await api('/api/client/moi', CK); t('le portail sait qu\'une review attend', r.d.commandes[0].creatives === 1 && r.d.commandes[0].a_reviewer === true, JSON.stringify(r.d.commandes[0].creatives));

// la review du client
r = await api('/api/client/commandes/' + kid + '/creatives', CK); const L = r.d.livraisons;
t('le client voit la version 2, 2 fichiers, sans les commentaires internes', L.length === 1 && L[0].version === 2 && L[0].fichiers.length === 2 && L[0].fichiers.every(f => f.commentaires.length === 0) && !('note_kreative' in L[0]), JSON.stringify(L.map(l => [l.version, l.fichiers.length])));
r = await get('/fichiers/' + f2, { headers: { Cookie: CK } }); const octets = Buffer.from(await r.arrayBuffer());
t('le client ouvre son fichier (les bons octets)', r.status === 200 && octets.equals(PNG) && r.headers.get('content-type') === 'image/png', r.status);
r = await get('/fichiers/' + f2 + '?dl=1', { headers: { Cookie: CK } }); t('… et le télécharge avec son nom', /attachment; filename="NOVA_STANDARD_01.png"/.test(r.headers.get('content-disposition') || ''), r.headers.get('content-disposition'));
r = await get('/fichiers/' + f2, { headers: { Cookie: CK2 } }); t('un autre client ne peut pas l\'ouvrir', r.status === 403, r.status);
r = await get('/fichiers/' + f2); t('sans connexion : refusé', r.status === 403, r.status);
const fFeed = L[0].fichiers.find(f => f.format === '4x5').id;
r = await api('/api/client/fichiers/' + fFeed + '/approuver', CK, 'POST', { oui: true }); t('approuver un fichier', r.s === 200);
r = await api('/api/client/commentaires', CK, 'POST', { fichier_id: f2, texte: 'Passer le titre en blanc', forme: { t: 'fleche', x1: .2, y1: .8, x2: .5, y2: .5 }, couleur: '#30a46c' }); const com = r.d.id;
t('commentaire du client avec une flèche', r.s === 200 && com > 0, JSON.stringify(r.d));
r = await api('/api/client/commentaires', CK2, 'POST', { fichier_id: f2, texte: 'pirate' }); t('un autre client ne peut pas commenter', r.s === 409, r.s);
r = await api('/api/equipe/livraisons/TURNLY_10_bc5e', DE); const cv = r.d.versions[0].fichiers.find(f => f.id === f2).commentaires;
t('la designer voit le commentaire du client et son annotation', cv.length === 1 && cv[0].role === 'client' && cv[0].forme.t === 'fleche', JSON.stringify(cv));
r = await api('/api/client/commentaires/' + com, CK, 'DELETE'); r = await api('/api/client/commentaires', CK, 'POST', { fichier_id: f2, texte: 'Passer le titre en blanc', forme: { t: 'cercle', x1: .1, y1: .1, x2: .4, y2: .3 } });
const avantMails2 = lignes('emails.log').length;
r = await api('/api/client/livraisons/' + v2.id + '/terminer', CK, 'POST'); t('review terminée avec des retouches', r.s === 200 && r.d.approuvee === false, JSON.stringify(r.d));
await new Promise(z => setTimeout(z, 400));
const mailK = lignes('emails.log').slice(avantMails2).map(l => JSON.parse(l).corps).pop() || {};
t('Kreative reçoit un email avec le lien des retours', mailK.a === 'contact@kreativeads.fr' && /retours du client/.test(mailK.sujet) && /\/admin\/#\/livraisons\/TURNLY_10_bc5e/.test(mailK.html), JSON.stringify(mailK).slice(0, 160));
r = await api('/api/admin/clients/' + cid, A); t('commande en « retouches »', r.d.commandes[0].statut === 'revisions', r.d.commandes[0].statut);
r = await api('/api/client/commentaires', CK, 'POST', { fichier_id: f2, texte: 'trop tard' }); t('plus de commentaire après la review', r.s === 409, r.s);

// version 3 : le client approuve tout, le projet est validé
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: 'TURNLY_10_bc5e' }); const v3 = r.d;
t('version 3 : le fichier approuvé le reste', v3.version === 3 && v3.fichiers.find(f => f.format === '4x5').approuve_le, JSON.stringify(v3.fichiers && v3.fichiers.map(f => f.approuve_le)));
await deposer(v3.id, 'NOVA_STANDARD_01.png', '1x1');
await api('/api/equipe/livraisons/' + v3.id + '/envoyer', DE, 'POST', {});
await api('/api/equipe/livraisons/' + v3.id + '/decision', A, 'POST', { action: 'envoyer' });
r = await api('/api/client/commandes/' + kid + '/creatives', CK); t('le client voit les versions 3 et 2', r.d.livraisons.map(l => l.version).join(',') === '3,2', r.d.livraisons.map(l => l.version).join(','));
r = await api('/api/client/livraisons/' + v3.id + '/tout-approuver', CK, 'POST'); t('tout approuver', r.s === 200);
r = await api('/api/client/livraisons/' + v3.id + '/terminer', CK, 'POST'); t('review terminée, tout approuvé : projet validé', r.d.approuvee === true && r.d.valide === true, JSON.stringify(r.d));
r = await api('/api/admin/clients/' + cid, A); t('commande « validée »', r.d.commandes[0].statut === 'valide', r.d.commandes[0].statut);
r = await api('/api/equipe/livraisons', A); t('la liste de l\'admin connaît la marque et le numéro', r.d.some(l => l.dossier === 'TURNLY_10_bc5e' && l.marque === 'Nova' && l.ref), JSON.stringify(r.d[0]));

// n8n relie le brief à la commande
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'starter', formule: 'unique' }); const ref = r.d.ref, k2 = r.d.id;
r = await api('/api/n8n/brief', '', 'POST', { dossier: 'NOVA_10_abcd', commande: ref }, { 'X-Kreative-Cle': 'mauvaise' }); t('n8n : mauvaise clé refusée', r.s === 403, r.s);
r = await api('/api/n8n/brief', '', 'POST', { dossier: 'NOVA_10_abcd', commande: ref }, { 'X-Kreative-Cle': sec.CLE }); t('n8n : brief relié à la commande #' + ref, r.s === 200 && r.d.ok && r.d.commande === ref, JSON.stringify(r.d));
r = await api('/api/admin/clients/' + cid, A); const kk = r.d.commandes.find(c => c.id === k2);
t('la commande passe en production avec son dossier', kk.dossier === 'NOVA_10_abcd' && kk.statut === 'production', JSON.stringify([kk.dossier, kk.statut]));
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'scale', formule: 'unique' });
r = await api('/api/n8n/brief', '', 'POST', { dossier: 'NOVA_11_ef01', email: 'INES@nova.fr' }, { 'X-Kreative-Cle': sec.CLE }); t('n8n : sans numéro, retrouvé par l\'email', r.d.ok === true, JSON.stringify(r.d));

// les livraisons de démo
r = await api('/api/admin/demo', A, 'POST');
r = await api('/api/equipe/livraisons', A); t('démo : 4 versions (à vérifier, chez le client, retouches)', r.d.filter(l => /^l_demo_/.test(l.id)).length === 4, r.d.length);
r = await api('/api/admin/clients/c_demo_pulse', A); const accesPulse = cookie(await get(new URL(r.d.client.lien).pathname));
r = await api('/api/client/commandes/k_demo_pulse_7/creatives', accesPulse); t('démo Pulse : 15 fichiers en review', r.d.livraisons.length === 1 && r.d.livraisons[0].fichiers.length === 15, JSON.stringify(r.d).slice(0, 120));
r = await get('/fichiers/fi_demo_pulse1_1x11', { headers: { Cookie: accesPulse } }); t('démo : l\'image vient du dépôt', r.status === 200 && /image\/jpeg/.test(r.headers.get('content-type') || ''), r.status);
r = await api('/api/admin/demo', A, 'DELETE');
r = await api('/api/equipe/livraisons', A); t('démo retirée : plus de livraisons de démo', !r.d.some(l => /^l_demo_/.test(l.id)), r.d.length);

// supprimer une version de test (ex. REDO2_52P94H) : réservé à l'admin, fichiers et commentaires compris
{
  const L = (await api('/api/equipe/livraisons', A)).d, cible = L.find(l => l.nb > 0) || L[0];
  r = await api('/api/equipe/livraisons/' + cible.id, DE, 'DELETE'); t('la designer ne peut pas supprimer une livraison', r.s === 403, r.s);
  r = await api('/api/equipe/livraisons/' + cible.id, A, 'DELETE');
  const apres = (await api('/api/equipe/livraisons', A)).d;
  t('l\'admin supprime une version : elle disparaît de la liste', r.s === 200 && !apres.some(l => l.id === cible.id), r.s + ' ' + JSON.stringify(r.d).slice(0, 120));
  r = await api('/api/equipe/livraisons/' + cible.id, A, 'DELETE'); t('… une deuxième fois : introuvable', r.s === 404, r.s);
}
console.log('\n' + ok + ' ok, ' + ko + ' en échec');
process.exit(ko ? 1 : 0);

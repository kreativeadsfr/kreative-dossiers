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
// ------------------------------------------------------------------
//  KANBAN, RETOUCHES ET SYNCHRO : une seule étape pour tout le monde
// ------------------------------------------------------------------
const etat = async d => (await api('/api/equipe/etats', A)).d.etats[d] || {};
const moi = async ck => (await api('/api/client/moi', ck)).d;
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Senso', contact: 'Lou', email: 'lou@senso.fr' }); const cid = r.d.id;
const CK = cookie(await get(new URL(r.d.lien).pathname));
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'starter', formule: 'unique', dossier: 'SENSEFRAGRANCE_10_7cf1' }); const kid = r.d.id;
const D = 'SENSEFRAGRANCE_10_7cf1';

// droits
r = await api('/api/equipe/etats', ST); t('le stratégiste lit les états', r.s === 200 && r.d.etats, r.s);
r = await api('/api/equipe/etats', DE); t('la designer lit les états', r.s === 200, r.s);
r = await api('/api/equipe/etats', CK); t('le client ne lit pas les états', r.s === 403, r.s);
r = await api('/api/equipe/deplacer', DE, 'POST', { dossier: D, vers: 'client' }); t('la designer ne déplace pas', r.s === 403, r.s);
r = await api('/api/equipe/deplacer', ST, 'POST', { dossier: D, vers: 'desi' }); t('le stratégiste ne déplace pas', r.s === 403, r.s);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'nulle-part' }); t('colonne inconnue refusée', r.s === 400, r.s);
r = await api('/api/equipe/livraisons', ST, 'POST', { dossier: D }); t('le stratégiste ne dépose pas de version', r.s === 403, r.s);

// 1. glisser (sans version) : l'étape est notée, la commande et le client suivent
let c = await moi(CK); const etapeProd = k => k.etapes.find(e => e.cle === 'production');
t('client : stratégie au départ', etapeProd(c.commandes[0]).detail === 'Stratégie et copywriting', etapeProd(c.commandes[0]).detail);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'desi' });
t('glissé chez le designer', r.s === 200 && r.d.action === 'etape' && r.d.etats.etats[D].o.etape === 'desi', JSON.stringify(r.d).slice(0, 200));
c = await moi(CK); t('client : création des visuels', etapeProd(c.commandes[0]).detail === 'Création des visuels', etapeProd(c.commandes[0]).detail);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'livrer' }); t('glissé en vérification', (await etat(D)).o.etape === 'livrer');
c = await moi(CK); t('client : contrôle qualité', etapeProd(c.commandes[0]).detail === 'Contrôle qualité avant l\'envoi', etapeProd(c.commandes[0]).detail);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'client' });
r = await api('/api/admin/clients/' + cid, A); t('glissé chez le client : commande « livré »', r.d.commandes[0].statut === 'livre', r.d.commandes[0].statut);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'desi' });
r = await api('/api/admin/clients/' + cid, A); t('ramené chez le designer : commande « retouches »', r.d.commandes[0].statut === 'revisions', r.d.commandes[0].statut);

// 2. la designer dépose : sa version remplace le déplacement manuel
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: D }); const v1 = r.d;
await deposer(v1.id, 'SENSO_STANDARD_01.png', '1x1'); await deposer(v1.id, 'SENSO_FEED_01.png', '4x5');
r = await api('/api/equipe/livraisons/' + v1.id + '/envoyer', DE, 'POST', {});
let e = await etat(D); t('version 1 à vérifier, plus de déplacement manuel', e.v.statut === 'a_verifier' && !e.o, JSON.stringify(e));
// 3. glisser « chez le client » = envoyer au client (email)
const avant = lignes('emails.log').length;
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'client' }); t('envoyer en glissant demande une confirmation', r.d.confirmer === true && (await etat(D)).v.statut === 'a_verifier', JSON.stringify(r.d).slice(0, 120));
const [x1, x2] = await Promise.all([api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'client', confirme: true }), api('/api/equipe/livraisons/' + v1.id + '/decision', A, 'POST', { action: 'envoyer' })]);
r = [x1, x2].find(x => x.d && x.d.action === 'envoyee') || x1;
t('glisser + bouton en même temps : un seul envoi', [x1, x2].filter(x => (x.d && x.d.action === 'envoyee') || (x.d && x.d.ok)).length === 1, JSON.stringify([x1.d, x2.d]).slice(0, 200));
await new Promise(z => setTimeout(z, 400));
const mails = lignes('emails.log').slice(avant).map(l => JSON.parse(l).corps);
t('un seul email au client', mails.filter(m => m.type === 'creatives').length === 1, mails.length);
t('glissé chez le client : version envoyée', (await etat(D)).v.statut === 'envoyee' && (await etat(D)).v.statut === 'envoyee', JSON.stringify(r.d).slice(0, 160));
t('… et le client reçoit l\'email de ses créatives', mails.some(m => m.a === 'lou@senso.fr' && m.type === 'creatives'), JSON.stringify(mails).slice(0, 200));
r = await api('/api/client/commandes/' + kid + '/creatives', CK); t('le client voit la version 1', r.d.livraisons.length === 1 && r.d.livraisons[0].version === 1, JSON.stringify(r.d).slice(0, 100));

// 4. retours du client sur les textes : le stratégiste d'abord
const fFeed = r.d.livraisons[0].fichiers.find(f => f.format === '4x5').id;
await api('/api/client/commentaires', CK, 'POST', { fichier_id: fFeed, texte: 'Remplacer « dès 29 € » par « à partir de 29 € »' });
r = await api('/api/client/livraisons/' + v1.id + '/terminer', CK, 'POST');
e = await etat(D); t('retours sur les textes : retouches chez le stratégiste', e.v.statut === 'review_terminee' && e.v.retouche === 'strategiste', JSON.stringify(e));
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: D }); t('la designer attend le stratégiste', r.s === 409 && /strategist/.test(r.d.erreur), JSON.stringify(r.d));
r = await api('/api/equipe/livraisons/' + D, ST); t('le stratégiste voit les commentaires du client', r.s === 200 && r.d.versions[0].fichiers.some(f => f.commentaires.some(c => c.role === 'client')), r.s);
r = await api('/api/equipe/commentaires', ST, 'POST', { fichier_id: fFeed, texte: 'Nouveau texte dans la fiche' }); t('le stratégiste laisse une note interne', r.s === 200, r.s);
r = await api('/api/client/commandes/' + kid + '/creatives', CK); t('le client ne voit pas la note interne', r.d.livraisons[0].fichiers.every(f => f.commentaires.every(c => c.role !== 'strategiste')), '');
r = await api('/api/equipe/livraisons/' + v1.id + '/retouches-faites', DE, 'POST', {}); t('la designer ne peut pas valider les textes', r.s === 403, r.s);
r = await api('/api/equipe/livraisons/' + v1.id + '/retouches-faites', ST, 'POST', {}); t('textes corrigés : à la designer', r.s === 200 && (await etat(D)).v.retouche === 'designer', JSON.stringify(r.d));
r = await api('/api/equipe/livraisons/' + v1.id + '/retouches-faites', ST, 'POST', {}); t('… une seule fois', r.s === 409, r.s);
// 5. Kreative peut changer qui s'en occupe, aussi en glissant
r = await api('/api/equipe/livraisons/' + v1.id + '/retouche', A, 'POST', { pour: 'strategiste' }); t('Kreative rend la main au stratégiste', (await etat(D)).v.retouche === 'strategiste');
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'desi' }); t('glissé chez le designer : retouches à la designer', r.d.action === 'retouches' && (await etat(D)).v.retouche === 'designer', JSON.stringify(r.d).slice(0, 120));
// 6. version 2
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: D }); const v2 = r.d; t('la designer ouvre la version 2', r.s === 200 && v2.version === 2, JSON.stringify(r.d).slice(0, 100));
await deposer(v2.id, 'SENSO_FEED_01.png', '4x5');
await api('/api/equipe/livraisons/' + v2.id + '/envoyer', DE, 'POST', {});
// renvoyer au stratégiste depuis la vérification
r = await api('/api/equipe/livraisons/' + v2.id + '/decision', A, 'POST', { action: 'corriger', pour: 'strategiste', note: 'Une faute sur le CTA' });
e = await etat(D); t('renvoyée au stratégiste depuis la vérification', e.v.statut === 'a_corriger' && e.v.retouche === 'strategiste', JSON.stringify(e));
await api('/api/equipe/livraisons/' + v2.id + '/retouches-faites', ST, 'POST', {});
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: D }); t('puis la designer corrige la même version… en version 3', r.s === 200 && r.d.version === 3, JSON.stringify(r.d).slice(0, 80));
const v3 = r.d; await deposer(v3.id, 'SENSO_FEED_01.png', '4x5'); await api('/api/equipe/livraisons/' + v3.id + '/envoyer', DE, 'POST', {});
r = await api('/api/equipe/livraisons/' + v3.id + '/decision', A, 'POST', { action: 'envoyer' });
e = await etat(D); t('version 3 chez le client', e.v.statut === 'envoyee' && e.v.version === 3 && !e.v.retouche, JSON.stringify(e));
r = await api('/api/admin/clients/' + cid, A); t('commande « livré » après la nouvelle version', r.d.commandes[0].statut === 'livre', r.d.commandes[0].statut);
// 7. retours sur le visuel : directement la designer
r = await api('/api/client/commandes/' + kid + '/creatives', CK); const f3 = r.d.livraisons[0].fichiers[0].id;
await api('/api/client/commentaires', CK, 'POST', { fichier_id: f3, texte: 'Le logo est trop petit' });
await api('/api/client/livraisons/' + v3.id + '/terminer', CK, 'POST');
e = await etat(D); t('retours sur le visuel : retouches chez la designer', e.v.retouche === 'designer', JSON.stringify(e));
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'client' });
e = await etat(D); t('glissé de nouveau chez le client : sa review reprend', r.d.action === 'retour_client' && e.v.statut === 'envoyee' && !e.v.retouche, JSON.stringify(r.d).slice(0, 100));
r = await api('/api/admin/clients/' + cid, A); t('… commande de nouveau « livré »', r.d.commandes[0].statut === 'livre', r.d.commandes[0].statut);
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: D, vers: 'desi' }); t('retirer la review au client demande confirmation', r.d.confirmer === true, JSON.stringify(r.d).slice(0, 100));
const [y1, y2] = await Promise.all([api('/api/client/livraisons/' + v3.id + '/terminer', CK, 'POST'), api('/api/client/livraisons/' + v3.id + '/terminer', CK, 'POST')]);
t('deux « review terminée » en même temps : une seule passe', [y1, y2].filter(x => x.s === 200).length === 1, JSON.stringify([y1.s, y2.s]));
// le brief d'un autre client ne se relie pas
r = await api('/api/admin/clients', A, 'POST', { marque: 'Intrus', email: 'intrus@x.fr' }); const cid2 = r.d.id;
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid2, pack: 'starter', formule: 'unique' }); const ref2 = r.d.ref;
r = await api('/api/n8n/brief', '', 'POST', { dossier: 'REDO2_52P94H', commande: ref2, client: cid }, { 'X-Kreative-Cle': sec.CLE });
t('lien de brief trafiqué : la commande d\'un autre client n\'est pas reliée', !(r.d && r.d.ok && r.d.commande === ref2), JSON.stringify(r.d));
// 8. un projet de démo glissé ne prévient personne
const avant2 = lignes('emails.log').length;
await api('/api/admin/demo', A, 'POST');
r = await api('/api/equipe/deplacer', A, 'POST', { dossier: 'TEST_DEMO_ORIA', vers: 'client', confirme: true });
await new Promise(z => setTimeout(z, 400));
t('démo envoyée sans email', r.d.action === 'envoyee' && lignes('emails.log').length === avant2, lignes('emails.log').slice(avant2).join('|').slice(0, 160));
await api('/api/admin/demo', A, 'DELETE');
r = await api('/api/equipe/etats', A); t('démo retirée : plus d\'état de démo', !Object.keys(r.d.etats).some(d => /^TEST_DEMO_/.test(d)), Object.keys(r.d.etats).join(','));
console.log('\n' + ok + ' ok, ' + ko + ' en échec');

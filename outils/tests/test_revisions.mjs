import fs from 'node:fs';
// ------------------------------------------------------------------
//  RÉVISIONS (v75, 02/11/2026) : Kreative répartit les retours du client créa par créa
//  (moi / la designer / à refaire par le stratégiste puis la designer), la version N+1
//  se remplit créa par créa, et part au client quand tout est fait.
//  Le stratégiste et la designer ne savent jamais que l'autre existe.
// ------------------------------------------------------------------
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const deposer = (liv, nom, format, ck, crea) => get('/api/equipe/fichiers?livraison=' + liv + '&format=' + format + '&nom=' + encodeURIComponent(nom) + '&l=1080&h=1080' + (crea ? '&crea=' + crea : ''), { method: 'PUT', headers: { Cookie: ck || DE, 'Content-Type': 'image/png' }, body: PNG }).then(async r => ({ s: r.status, d: await r.json().catch(() => null) }));
const etat = async d => (await api('/api/equipe/etats', A)).d.etats[d] || {};

let r = await api('/api/admin/clients', A, 'POST', { marque: 'Pulso', contact: 'Noah', email: 'noah@pulso.fr' }); const cid = r.d.id;
const CK = cookie(await get(new URL(r.d.lien).pathname));
const D = 'PULSO_11_ab12';
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'growth', formule: 'unique', dossier: D }); const kid = r.d.id;

// version 1 : 4 créas en 1:1 et 4:5
r = await api('/api/equipe/livraisons', DE, 'POST', { dossier: D }); const v1 = r.d;
for (const n of ['01', '02', '03', '04']) { await deposer(v1.id, 'PULSO_STANDARD_' + n + '.png', '1x1'); await deposer(v1.id, 'PULSO_FEED_' + n + '.png', '4x5'); }
await api('/api/equipe/livraisons/' + v1.id + '/envoyer', DE, 'POST', {});
await api('/api/equipe/livraisons/' + v1.id + '/decision', A, 'POST', { action: 'envoyer' });
r = await api('/api/client/commandes/' + kid + '/creatives', CK);
const F = r.d.livraisons[0].fichiers, fic = (n, fmt) => F.find(f => f.nom === (fmt === '1x1' ? 'PULSO_STANDARD_' : 'PULSO_FEED_') + n + '.png').id;
await api('/api/client/commentaires', CK, 'POST', { fichier_id: fic('01', '1x1'), texte: 'Plutôt « Gagnez 2 h par jour » que « Gagnez du temps »' });
await api('/api/client/commentaires', CK, 'POST', { fichier_id: fic('02', '4x5'), texte: 'Serait-il possible de mettre un visuel de l\'interface de ticket ?' });
await api('/api/client/commentaires', CK, 'POST', { fichier_id: fic('03', '1x1'), texte: 'Je n\'aime pas trop celle-ci, elle ne parle pas vraiment à nos clients.' });
r = await api('/api/client/livraisons/' + v1.id + '/terminer', CK, 'POST');
let e = await etat(D); t('review terminée : les retours attendent la répartition', e.v.statut === 'review_terminee' && e.v.retouche === 'repartir', JSON.stringify(e));

// droits de la répartition
r = await api('/api/equipe/livraisons/' + v1.id + '/repartir', DE, 'POST', { items: [{ crea: '01', qui: 'moi' }] }); t('la designer ne répartit pas', r.s === 403, r.s);
r = await api('/api/equipe/livraisons/' + v1.id + '/repartir', ST, 'POST', { items: [{ crea: '01', qui: 'moi' }] }); t('le stratégiste ne répartit pas', r.s === 403, r.s);
r = await api('/api/equipe/livraisons/' + v1.id + '/repartir', A, 'POST', { items: [{ crea: '99', qui: 'moi' }, { crea: '01', qui: 'personne' }] }); t('créa inconnue ou choix inconnu : refusé', r.s === 400, r.s);

// Kreative répartit
const TG = new URL('telegram.log', import.meta.url); try { fs.unlinkSync(TG); } catch (x) {}
r = await api('/api/equipe/livraisons/' + v1.id + '/repartir', A, 'POST', { items: [{ crea: '01', qui: 'moi', formats: ['1x1', '4x5', '9x16'] }, { crea: '02', qui: 'designer', note: 'Garder le même fond' }, { crea: '03', qui: 'refaire' }] });
await new Promise(z => setTimeout(z, 400));
const tg = fs.existsSync(TG) ? fs.readFileSync(TG, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
const tgD = tg.find(x => x.corps.chat_id === '-1004299298150'), tgS = tg.find(x => x.corps.chat_id === '-5241939931');
t('Telegram : la designer est prévenue (en anglais, AD02 seulement)', tgD && /Revisions \| Pulso/.test(tgD.corps.text) && /AD02/.test(tgD.corps.text) && !/AD03|AD01/.test(tgD.corps.text) && tgD.chemin === '/telegram/botbot-test/sendMessage', JSON.stringify(tg).slice(0, 300));
t('Telegram : le stratégiste est prévenu (AD03 à refaire)', tgS && /Retouches \| Pulso/.test(tgS.corps.text) && /AD03/.test(tgS.corps.text) && !/AD02/.test(tgS.corps.text), JSON.stringify(tgS));
t('Telegram : aucun message ne nomme l\'autre', tg.every(x => !/designer|andrea|strat[eé]g|lo[iï]c/i.test(x.corps.text)), tg.map(x => x.corps.text).join(' | '));
t('répartition acceptée', r.s === 200 && r.d.travail, JSON.stringify(r.d));
const travail = r.d.travail;
r = await api('/api/equipe/livraisons/' + v1.id + '/repartir', A, 'POST', { items: [{ crea: '01', qui: 'moi' }] }); t('… une seule fois', r.s === 409, r.s);
r = await api('/api/equipe/livraisons/' + D, A);
const v2 = r.d.versions[0];
t('la version 2 reprend toutes les créas de la version 1', v2.version === 2 && v2.statut === 'brouillon' && v2.fichiers.length === 8, v2.version + ' ' + v2.fichiers.length);
e = await etat(D); t('état : retouches 0 sur 3 (1 pour Kreative, 1 designer, 1 stratégiste)', e.v.ret && e.v.ret.total === 3 && e.v.ret.moi === 1 && e.v.ret.desi === 1 && e.v.ret.strat === 1, JSON.stringify(e.v));

// ce que chacun voit
r = await api('/api/equipe/revisions/' + D, A); t('Kreative voit les 3 retouches avec qui', r.d.items.length === 3 && r.d.items.every(x => x.qui), JSON.stringify(r.d).slice(0, 160));
const rDe = await api('/api/equipe/revisions', DE);
const pDe = (rDe.d || []).find(p => p.dossier === D);
t('la designer voit seulement sa retouche (pas encore la créa à refaire)', pDe && pDe.items.length === 1 && pDe.items[0].crea === '02' && pDe.items[0].type === 'visuel', JSON.stringify(rDe.d).slice(0, 200));
t('… avec la précision de Kreative', pDe && pDe.items[0].note === 'Garder le même fond', '');
t('… sans jamais le rôle de l\'autre ni qui fait quoi', pDe && !JSON.stringify(pDe).match(/strateg|"qui"|refaire|lo[iï]c/i), JSON.stringify(pDe).slice(0, 300));
const rSt = await api('/api/equipe/revisions/' + D, ST);
t('le stratégiste voit seulement la créa à refaire', rSt.d.items.length === 1 && rSt.d.items[0].crea === '03' && /aime pas/.test(rSt.d.items[0].coms[0].texte), JSON.stringify(rSt.d).slice(0, 200));
t('… sans jamais le rôle de l\'autre', !JSON.stringify(rSt.d).match(/designer|andrea|"qui"|texte_en/i), JSON.stringify(rSt.d).slice(0, 300));
// v81 : Kreative qui ouvre l'espace de la designer ou du stratégiste voit exactement ce qu'ils voient
const vD = await api('/api/equipe/revisions?vue=designer', A); const pvD = (vD.d || []).find(p => p.dossier === D);
t('admin en vue designer : la même chose que la designer (AD02 seulement, sans « qui »)', pvD && JSON.stringify(pvD) === JSON.stringify(pDe), JSON.stringify(pvD).slice(0, 200));
const vS = await api('/api/equipe/revisions/' + D + '?vue=strategiste', A);
t('admin en vue stratégiste : la même chose que le stratégiste', JSON.stringify(vS.d) === JSON.stringify(rSt.d), JSON.stringify(vS.d).slice(0, 200));
// 12/11 : un projet avec des créas à refaire ne s'ouvre que sur ces créas, quel que soit le bouton (Fiche, Ouvrir la fiche, lien direct)
{
  const { createRequire } = await import('node:module'); const { chromium } = createRequire(import.meta.url)('playwright');
  const nav = await chromium.launch(); const ctx = await nav.newContext();
  await ctx.addCookies([{ name: ST.split('=')[0], value: ST.split('=').slice(1).join('='), url: B }]);
  const pg = await ctx.newPage(); const err = []; pg.on('pageerror', e => err.push(e.message));
  // le projet Pulso n'existe que dans la base de test : on l'ajoute à la liste des projets lue par la page
  await pg.route(/\/projets\.json/, async rt => { const rep = await rt.fetch(); let l = []; try { l = await rep.json(); } catch (e) {}
    if (Array.isArray(l) && !l.some(p => p.dossier === D)) l.unshift({ dossier: D, brand_name: 'Pulso', nb_creas: 4, pack: 'growth', date: '2026-11-01' });
    await rt.fulfill({ response: rep, body: JSON.stringify(l), headers: { ...rep.headers(), 'content-type': 'application/json' } }); });
  await pg.route(/\/PULSO_11_ab12\/donnees\.json/, rt => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brand_name: 'Pulso', nb_creas: 4, pack: 'growth', deadline_strategiste: '2026-11-20T10:00:00Z' }) }));
  await pg.goto(B + '/strategiste/#/projets'); await pg.waitForSelector('.app:not(.squelette)', { timeout: 15000 }); await pg.waitForTimeout(600);
  const hrefs = await pg.$$eval('a', l => l.map(a => a.getAttribute('href')).filter(h => /PULSO_11_ab12/.test(h || '')));
  t('Projets : le bouton Fiche mène aux créas à refaire', hrefs.includes('#/reprise/' + D) && !hrefs.includes('#/fiche/' + D), JSON.stringify(hrefs));
  await pg.goto(B + '/strategiste/#/fiche/' + D); await pg.waitForFunction(d => location.hash === '#/reprise/' + d, D, { timeout: 15000 }).catch(() => {});
  await pg.waitForSelector('#vp-cadre', { timeout: 15000 }).catch(() => {});
  const src = await pg.getAttribute('#vp-cadre', 'src').catch(() => '');
  t('lien direct vers la fiche complète : renvoyé sur les créas à refaire', (await pg.evaluate(() => location.hash)) === '#/reprise/' + D && /reprise=3(&|$)/.test(src || ''), (await pg.evaluate(() => location.hash)) + ' ' + src);
  await pg.goto(B + '/strategiste/#/fiche/TURNLY_10_bc5e'); await pg.waitForTimeout(1500);
  t('un projet sans retours garde sa fiche complète', (await pg.evaluate(() => location.hash)) === '#/fiche/TURNLY_10_bc5e', await pg.evaluate(() => location.hash));
  t('aucune erreur JavaScript (stratégiste)', !err.length, err.join(' | '));
  await nav.close();
}
r = await api('/api/equipe/revisions?vue=admin', DE); const pDe2 = (r.d || []).find(p => p.dossier === D);
t('la designer ne peut pas demander une autre vue', pDe2 && pDe2.items.length === 1 && !pDe2.items[0].qui, JSON.stringify(r.d).slice(0, 160));
r = await api('/api/equipe/revisions/' + D + '?vue=designer', ST); t('le stratégiste ne peut pas voir la vue designer', r.d.items.length === 1 && r.d.items[0].crea === '03' && !JSON.stringify(r.d).includes('texte_en'), JSON.stringify(r.d).slice(0, 160));
r = await api('/api/equipe/etats', DE); t('l\'état du projet ne nomme personne (designer)', !JSON.stringify(r.d.etats[D] || {}).match(/strateg/i), JSON.stringify(r.d.etats[D]));

// la designer ne peut pas « envoyer » la version de retouches : c'est Kreative qui l'envoie
r = await api('/api/equipe/livraisons/' + travail + '/envoyer', DE, 'POST', {}); t('la designer n\'envoie pas la version de retouches elle-même', r.s === 409, r.s);

// la designer dépose AD02 (les 2 formats), même avec un autre nom de fichier
r = await api('/api/equipe/revisions/' + D, A); t('seul le format commenté est demandé (AD02 : 4:5)', JSON.stringify(r.d.items.find(x => x.crea === '02').requis) === '["4x5"]', JSON.stringify(r.d.items.find(x => x.crea === '02')).slice(0, 200));
let d1 = await deposer(travail, 'Pulso-02-new-square.png', '1x1', DE, '02');
r = await api('/api/equipe/revisions/' + D, A); t('un seul format déposé : pas encore faite', d1.s === 200 && r.d.items.find(x => x.crea === '02').etat === 'a_faire', JSON.stringify(d1.d));
await deposer(travail, 'Pulso-02-new-feed.png', '4x5', DE, '02');
r = await api('/api/equipe/revisions/' + D, A); const it2 = r.d.items.find(x => x.crea === '02');
t('les 2 formats déposés : retouche faite', it2.etat === 'faite' && it2.apres.length === 2, JSON.stringify(it2).slice(0, 200));
r = await api('/api/equipe/livraisons/' + D, A);
t('la nouvelle AD02 remplace l\'ancienne (toujours 8 fichiers)', r.d.versions[0].fichiers.length === 8 && !r.d.versions[0].fichiers.some(f => f.nom === 'PULSO_STANDARD_02.png'), r.d.versions[0].fichiers.map(f => f.nom).join(','));

// v82 : Kreative a choisi lui-même les formats de AD01 (1:1 et 4:5, le 9:16 n'existe pas : ignoré)
r = await api('/api/equipe/revisions/' + D, A); let it1 = r.d.items.find(x => x.crea === '01');
t('formats choisis à la répartition : 1:1 + 4:5 (commenté en 1:1 seulement)', JSON.stringify(it1.requis) === '["1x1","4x5"]', JSON.stringify(it1.requis));
// Kreative dépose AD01
await deposer(travail, 'PULSO_STANDARD_01.png', '1x1', A, '01');
r = await api('/api/equipe/revisions/' + D, A); it1 = r.d.items.find(x => x.crea === '01');
t('le 1:1 seul ne suffit pas quand le 4:5 est demandé', it1.etat === 'a_faire', it1.etat);
r = await api('/api/equipe/retouches/' + it1.id, DE, 'POST', { formats: ['1x1'] }); t('la designer ne change pas les formats', r.s === 403, r.s);
r = await api('/api/equipe/retouches/' + it1.id, A, 'POST', { formats: [] }); t('au moins un format', r.s === 400, r.s);
r = await api('/api/equipe/retouches/' + it1.id, A, 'POST', { formats: ['1x1'] });
r = await api('/api/equipe/revisions/' + D, A); t('Kreative retire le 4:5 : AD01 devient faite (1:1 déjà redéposé)', r.d.items.find(x => x.crea === '01').etat === 'faite', JSON.stringify(r.d.items.find(x => x.crea === '01')).slice(0, 200));
e = await etat(D); t('état : retouches 2 sur 3', e.v.ret.faites === 2 && e.v.ret.strat === 1, JSON.stringify(e.v.ret));

// pas d'envoi au client tant que tout n'est pas fait
r = await api('/api/equipe/livraisons/' + travail + '/envoyer-retouches', A, 'POST', {}); t('envoi au client refusé tant qu\'il reste une retouche', r.s === 409 && r.d.reste === 1, JSON.stringify(r.d));

// le stratégiste refait AD03 dans la fiche : une reprise dans un petit dossier à part
const LOG = new URL('fiche.log', import.meta.url); try { fs.unlinkSync(LOG); } catch (x) {}
r = await api('/api/equipe/fiche', DE, 'POST', { dossier: D, reprise: true, creas: [{ n: 3 }] }); t('la designer n\'envoie pas de reprise', r.s === 403, r.s);
r = await api('/api/equipe/fiche', ST, 'POST', { dossier: D, reprise: true, brand_name: 'Pulso', creas: [{ n: 3, titre: 'Nouveau' }, { n: 4, titre: 'Pas demandée' }], fichiers: { 3: [{ nom: 'logo.png', b64: 'AA' }], 4: [{ nom: 'x.png', b64: 'AA' }] } });
t('reprise envoyée', r.s === 200 && r.d.reprise === D + '_R1', JSON.stringify(r.d));
const recu = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8').trim().split('\n').pop()) : {};
t('n8n reçoit seulement AD03, dans le dossier _R1, avec le code', recu.dossier === D + '_R1' && recu.creas.length === 1 && recu.creas[0].n === 3 && recu.code === 'code-fiche-test' && Object.keys(recu.fichiers || {}).join() === '3' && recu.reprise === undefined, JSON.stringify(recu).slice(0, 200));
r = await api('/api/equipe/fiche', ST, 'POST', { dossier: D, reprise: true, creas: [{ n: 3 }] }); t('plus rien à refaire : 2e reprise refusée', r.s === 400 || r.s === 409, r.s);
r = await api('/api/equipe/revisions', DE); const p2 = r.d.find(p => p.dossier === D);
const it3 = p2 && p2.items.find(x => x.crea === '03');
t('la designer voit maintenant la nouvelle créa AD03, avec son aperçu', it3 && it3.type === 'nouvelle' && it3.reprise === D + '_R1', JSON.stringify(p2 && p2.items).slice(0, 200));
r = await api('/api/equipe/revisions/' + D, ST); t('le stratégiste voit sa reprise envoyée', r.d.items[0].reprise_le > 0 && r.d.items[0].etat === 'reprise', JSON.stringify(r.d.items[0]).slice(0, 160));

// la designer dépose AD03, Kreative envoie la version 2
await deposer(travail, 'PULSO_STANDARD_03.png', '1x1', DE, '03'); await deposer(travail, 'PULSO_FEED_03.png', '4x5', DE, '03');
e = await etat(D); t('toutes les retouches faites', e.v.ret.faites === 3, JSON.stringify(e.v.ret));
const avant = fs.existsSync(new URL('emails.log', import.meta.url)) ? fs.readFileSync(new URL('emails.log', import.meta.url), 'utf8').split('\n').filter(Boolean).length : 0;
r = await api('/api/equipe/livraisons/' + travail + '/envoyer-retouches', ST, 'POST', {}); t('le stratégiste n\'envoie pas au client', r.s === 403, r.s);
r = await api('/api/equipe/livraisons/' + travail + '/envoyer-retouches', A, 'POST', {}); t('Kreative envoie la version 2 au client', r.s === 200, JSON.stringify(r.d));
e = await etat(D); t('version 2 chez le client', e.v.statut === 'envoyee' && e.v.version === 2, JSON.stringify(e.v));
await new Promise(z => setTimeout(z, 300));
const mails = fs.readFileSync(new URL('emails.log', import.meta.url), 'utf8').split('\n').filter(Boolean).slice(avant).map(l => JSON.parse(l).corps);
t('le client reçoit l\'email des retouches', mails.some(m => m.type === 'creatives'), mails.map(m => m.type).join(','));
r = await api('/api/client/commandes/' + kid + '/creatives', CK);
const lv2 = r.d.livraisons.find(l => l.version === 2);
t('le client voit la version 2, AD04 garde sa validation éventuelle', lv2 && lv2.fichiers.length === 8, JSON.stringify(r.d.livraisons.map(l => l.version)));
r = await api('/api/equipe/revisions', DE); t('plus rien dans les révisions de la designer', !(r.d || []).some(p => p.dossier === D), JSON.stringify(r.d).slice(0, 120));

// Kreative change qui s'en occupe, ou marque faite
r = await api('/api/client/commandes/' + kid + '/creatives', CK);
await api('/api/client/commentaires', CK, 'POST', { fichier_id: lv2.fichiers.find(f => f.format === '1x1').id, texte: 'Le logo un peu plus grand' });
await api('/api/client/livraisons/' + lv2.id + '/terminer', CK, 'POST');
r = await api('/api/equipe/livraisons/' + lv2.id + '/repartir', A, 'POST', { items: [{ crea: '01', qui: 'designer' }] });
r = await api('/api/equipe/revisions/' + D, A); const ligne = r.d.items[0];
t('nouvelle répartition sur la version 2 (version 3 en cours)', r.d.travail.version === 3 && ligne.qui === 'designer', JSON.stringify(r.d).slice(0, 160));
r = await api('/api/equipe/retouches/' + ligne.id, A, 'POST', { qui: 'moi' }); t('Kreative reprend la retouche pour lui', r.s === 200 && (await api('/api/equipe/revisions/' + D, A)).d.items[0].qui === 'moi', r.s);
r = await api('/api/equipe/retouches/' + ligne.id, DE, 'POST', { faite: true }); t('la designer ne change pas la répartition', r.s === 403, r.s);
r = await api('/api/equipe/retouches/' + ligne.id, A, 'POST', { faite: true }); t('marquée faite sans nouveau fichier', (await api('/api/equipe/revisions/' + D, A)).d.items[0].etat === 'faite', r.s);
r = await api('/api/equipe/revisions/' + D, DE); t('la designer ne voit jamais une retouche faite par Kreative', r.d.items.length === 0, JSON.stringify(r.d.items));
r = await api('/api/equipe/revisions', DE); t('… ni dans sa liste Revisions', !(r.d || []).some(p => p.dossier === D), JSON.stringify(r.d).slice(0, 160));

// v77 : le stockage. Supprimer la version en préparation (une copie) n'efface pas les fichiers de la version d'avant
r = await api('/api/equipe/revisions/' + D, A); const v3id = r.d.travail.id;
r = await api('/api/equipe/livraisons/' + lv2.id + '/stockage', A); t('stockage de la version 2 : rien ne manque', r.s === 200 && r.d.manquants.length === 0, JSON.stringify(r.d));
r = await api('/api/equipe/livraisons/' + v3id, A, 'DELETE'); t('la version 3 en préparation est supprimée', r.s === 200, JSON.stringify(r.d));
r = await api('/api/equipe/livraisons/' + lv2.id + '/stockage', A); t('… les fichiers de la version 2 sont toujours là', r.d.manquants.length === 0, JSON.stringify(r.d));
const img = await get(lv2.fichiers[0].url, { headers: { Cookie: CK } }); t('le client voit toujours ses images', img.status === 200, img.status);
r = await api('/api/equipe/livraisons/' + lv2.id + '/stockage', DE); t('la designer ne lance pas la vérification', r.s === 403, r.s);
r = await get('/api/equipe/fichiers/' + lv2.fichiers[0].id + '/reparer', { method: 'PUT', headers: { Cookie: A, 'Content-Type': 'image/png' }, body: PNG });
t('réparer un fichier : remis à la même place', r.status === 200, r.status);
r = await api('/api/admin/diagnostic', A); t('diagnostic du Worker', r.s === 200 && r.d.worker === 'v87' && r.d.telegram_bot === true, JSON.stringify(r.d));
r = await api('/api/admin/diagnostic', DE); t('diagnostic : admin seulement', r.s === 403 || r.s === 401, r.s);

// v78 : une page modifiée sur main est servie dès le nouveau commit (avant : une copie pouvait rester figée des heures)
{
  const SHA = new URL('sha_main.txt', import.meta.url), FX = new URL('fixtures/ui/essai-commit.css', import.meta.url);
  fs.mkdirSync(new URL('fixtures/ui/', import.meta.url), { recursive: true });
  fs.writeFileSync(SHA, 'a'.repeat(40)); fs.writeFileSync(FX, '/* version 1 */');
  let p1 = await (await get('/ui/essai-commit.css', { headers: { Cookie: A } })).text();
  fs.writeFileSync(FX, '/* version 2 */'); fs.writeFileSync(SHA, 'b'.repeat(40));
  await new Promise(z => setTimeout(z, 16000));
  let p2 = await (await get('/ui/essai-commit.css', { headers: { Cookie: A } })).text();
  t('nouveau commit : la page est relue tout de suite', p1.includes('version 1') && p2.includes('version 2'), p1 + ' / ' + p2);
  r = await api('/api/admin/diagnostic', A); t('diagnostic : le commit du dépôt', r.d.depot_commit === 'bbbbbbb', JSON.stringify(r.d));
  // v85 : un nouveau commit ne fait relire que les fichiers qu'il change (avant : toutes les pages, l'admin mettait 10 s)
  const FY = new URL('fixtures/ui/essai-stable.css', import.meta.url), CMP = new URL('compare.json', import.meta.url);
  fs.writeFileSync(FY, '/* stable */');
  await get('/ui/essai-stable.css', { headers: { Cookie: A } });
  fs.writeFileSync(FX, '/* version 3 */'); fs.writeFileSync(CMP, JSON.stringify({ fichiers: ['ui/essai-commit.css'] })); fs.writeFileSync(SHA, 'c'.repeat(40));
  await new Promise(z => setTimeout(z, 16000));
  const avant = await (await fetch('http://127.0.0.1:9911/_compteur')).json();
  const ps = await (await get('/ui/essai-stable.css', { headers: { Cookie: A } })).text();
  const apres = await (await fetch('http://127.0.0.1:9911/_compteur')).json();
  const p3 = await (await get('/ui/essai-commit.css', { headers: { Cookie: A } })).text();
  t('nouveau commit : un fichier inchangé est servi sans relire GitHub', ps.includes('stable') && (apres.raw || 0) === (avant.raw || 0) && (apres.compare || 0) >= 1, JSON.stringify({ avant, apres }));
  t('nouveau commit : le fichier changé est relu tout de suite', p3.includes('version 3'), p3);
  fs.unlinkSync(SHA); fs.unlinkSync(FX); fs.unlinkSync(FY); fs.unlinkSync(CMP);
}
// v85 : le logo des emails sort du Worker, gardé un an (Gmail l'affiche dès l'ouverture)
{
  const lg = await get('/logo-email.png');
  const b = new Uint8Array(await lg.arrayBuffer());
  t('logo des emails : PNG servi sans connexion, gardé un an', lg.status === 200 && lg.headers.get('content-type') === 'image/png' && /public, max-age=31536000/.test(lg.headers.get('cache-control')) && b[1] === 0x50 && b.length > 1000, lg.status + ' ' + lg.headers.get('cache-control'));
  const lk = await get('/ui/logo-kreative-noir.png');
  t('logos publics gardés en cache partagé (plus « private »)', lk.status === 200 && /^public/.test(lk.headers.get('cache-control') || ''), lk.headers.get('cache-control'));
}

// la fiche du portail sait faire une reprise
const pf = await (await get('/fiche/', { headers: { Cookie: ST } })).text();
t('la fiche connaît le mode reprise', pf.includes('const EN_REPRISE') && pf.includes('reprise:true') && pf.includes('Envoyer la reprise'), '');
const ps = await (await get('/strategiste/', { headers: { Cookie: ST } })).text();
t('l\'espace du stratégiste ne parle jamais de la designer', !/(la|le|à la|the) designer|andrea/i.test(ps), (ps.match(/.{0,40}((la|le|à la|the) designer|andrea).{0,40}/i) || [''])[0]);
const pd = await (await get('/designer/', { headers: { Cookie: DE } })).text();
t('l\'espace de la designer ne parle jamais du stratégiste', !/strategist|stratégiste|lo[iï]c/i.test(pd), (pd.match(/.{0,40}(strategist|stratégiste|lo[iï]c).{0,40}/i) || [''])[0]);

console.log('\n' + ok + ' ok, ' + ko + ' en échec');

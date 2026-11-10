import fs from 'node:fs';
import { createRequire } from 'node:module';
// v86 (10/11) : le stratégiste ajoute sa propre image d'inspiration dans la fiche (meme, pub trouvée sur internet)
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
async function equipe(qui) { const r = await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES[qui], suite: '/' }) }); return cookie(r); }
const A = await equipe('dario'), ST = await equipe('strategiste'), DE = await equipe('andrea');
const IMG = fs.readFileSync(new URL('inspi-test.png', import.meta.url));
const envoi = (ck, corps, type, style) => get('/api/equipe/inspiration' + (style ? '?style=' + style : ''), { method: 'POST', headers: { Cookie: ck, 'Content-Type': type }, body: corps }).then(async r => ({ s: r.status, d: await r.json().catch(() => null) }));

// 1. l'API : seuls le stratégiste et l'admin déposent, en JPEG
const req = createRequire(import.meta.url); const { chromium } = req('playwright');
const nav = await chromium.launch();
const jpg = Buffer.from(await (async () => { const p = await nav.newPage(); const b = await p.evaluate(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/jpeg', .9).split(',')[1]; }, IMG.toString('base64')); await p.close(); return b; })(), 'base64');
let r = await envoi(ST, jpg, 'image/jpeg', 'natif'); const id = r.d && r.d.id;
t('le stratégiste ajoute une image (style natif : UGX-)', r.s === 200 && /^UGX-[a-f0-9]{12}$/.test(id || ''), JSON.stringify(r.d));
r = await envoi(A, jpg, 'image/jpeg'); t('… adaptée à la charte : PRX-, même empreinte', r.s === 200 && r.d.id === 'PRX-' + id.slice(4), JSON.stringify(r.d));
r = await envoi(DE, jpg, 'image/jpeg'); t('la designer ne dépose pas d\'inspiration', r.s === 403, r.s);
r = await envoi(ST, IMG, 'image/png'); t('autre chose qu\'un JPEG refusé', r.s === 415, r.s);
r = await envoi('', jpg, 'image/jpeg'); t('sans connexion : refusé', r.s === 403 || r.s === 401, r.s);
// servie au chemin des créas de la banque : n8n VISUELS, la page du batch et l'espace designer la lisent sans changement
for (const [nom, ck, p] of [['n8n', '', '/_n8n/' + sec.CLE + '/fiche/lot1/refs/' + id + '.jpg'], ['la designer', DE, '/fiche/lot1/refs/' + id + '.jpg'], ['le stratégiste', ST, '/fiche/lot2/refs/' + id + '.jpg']]) {
  const x = await get(p, { headers: { Cookie: ck } }); const b = Buffer.from(await x.arrayBuffer());
  t(nom + ' lit l\'image (' + p.split('/').slice(-3).join('/') + ')', x.status === 200 && x.headers.get('content-type') === 'image/jpeg' && b.equals(jpg), x.status + ' ' + x.headers.get('content-type'));
}
r = await get('/fiche/lot1/refs/UGX-000000000000.jpg', { headers: { Cookie: DE } }); t('image inconnue : 404', r.status === 404, r.status);
r = await get('/_n8n/mauvaise-cle/fiche/lot1/refs/' + id + '.jpg'); t('n8n sans la bonne clé : refusé', r.status === 403, r.status);

// 2. la fiche : « Ajouter ma propre image », textes repérés, emplacements corrigés, envoi
const ctx = await nav.newContext({ viewport: { width: 1400, height: 950 } });
await ctx.addCookies([{ name: ST.split('=')[0], value: ST.split('=').slice(1).join('='), url: B }]);
const pg = await ctx.newPage(); const err = []; pg.on('pageerror', e => err.push(e.message));
pg.on('dialog', d => d.dismiss());   // « meme ? » : Annuler = adaptée à la charte du client
const D = 'SENSEFRAGRANCE_10_7cf1';
await pg.goto(B + '/fiche/?projet=' + D + '&integre=1'); await pg.waitForSelector('#ajoutperso', { timeout: 20000 });
await pg.waitForFunction(() => typeof PRJ !== 'undefined' && PRJ, null, { timeout: 15000 });
await pg.setInputFiles('#persofile', new URL('inspi-test.png', import.meta.url).pathname);
await pg.waitForFunction(() => /repéré|Aucun texte/.test(document.getElementById('msg').textContent), null, { timeout: 120000 });
const msg = await pg.textContent('#msg');
const slots = await pg.$$eval('#zone .slot', l => l.map(x => x.querySelector('label').textContent + ' | ' + ((x.querySelector('.orig') || {}).textContent || '')));
t('textes repérés sur l\'image', /texte/.test(msg) && slots.length >= 2, msg + ' ' + JSON.stringify(slots));
t('le titre est reconnu', slots.some(s => /^Titre \| .*(payer|pubs)/i.test(s)), JSON.stringify(slots));
t('l\'image est choisie et affichée', await pg.$eval('#zone .prevhead', e => /PRX-/.test(e.textContent) && /Ton image/.test(e.textContent)), await pg.textContent('#zone .prevhead'));
t('elle apparaît en tête de la banque', await pg.$eval('#grid', g => g.children[1] && /PRX-/.test(g.children[1].textContent) && g.children[1].classList.contains('on')));
await pg.screenshot({ path: process.env.CAPTURE || '/tmp/inspi.png' });
// corriger : retirer un emplacement, en ajouter un, écrire les textes
const n0 = slots.length;
await pg.fill('#zone .slot[data-k="0"] input', 'Mon nouveau titre');
await pg.fill('#zone .slot[data-k="1"] input', 'Texte à retirer');
await pg.click('#zone .slot[data-k="1"] .sx');
t('un emplacement retiré, le texte de l\'autre est gardé', (await pg.$$('#zone .slot')).length === n0 - 1 && await pg.inputValue('#zone .slot[data-k="0"] input') === 'Mon nouveau titre', (await pg.$$('#zone .slot')).length);
await pg.click('#addslot');
t('un emplacement ajouté', (await pg.$$('#zone .slot')).length === n0, (await pg.$$('#zone .slot')).length);
const charge = await pg.evaluate(() => charge_utile());
const c1 = charge.creas[0];
t('la fiche envoie l\'image comme référence, avec ses textes', /^PRX-/.test(c1.reference) && c1.mode === 'inspi' && c1.textes[0].texte === 'Mon nouveau titre' && c1.textes.length === n0 && !c1.textes.some(x => x.texte === 'Texte à retirer'), JSON.stringify(c1).slice(0, 300));
// rechargée : l'image et ses emplacements sont gardés
await pg.reload(); await pg.waitForSelector('#strip .chip[data-i="1"]', { timeout: 30000 }); await pg.click('#strip .chip[data-i="1"]');   // la fiche reprend à la 1re créa pas encore remplie
await pg.waitForSelector('#zone .prevhead', { timeout: 10000 });
t('après rechargement : image et emplacements gardés', /PRX-/.test(await pg.textContent('#zone .prevhead')) && (await pg.$$('#zone .slot')).length === n0);
// en « nouvelle idée » : sa propre image parmi les inspirations
await pg.click('#m-libre');
await pg.click('#grid .it:not(.ajout)');   // la 1re tuile = son image
t('nouvelle idée : son image comme inspiration', await pg.evaluate(() => crea(cur).moods.some(m => /^PRX-/.test(m))), await pg.evaluate(() => JSON.stringify(crea(cur).moods)));
t('nouvelle idée : son image s\'affiche, et le bouton « Ma propre image » reste là', await pg.$eval('#zone .moods', m => /data:image/.test(m.innerHTML) && !!m.querySelector('button[data-perso]')));
// 10/11 (Podmax) : le compte d'envois vient du serveur : un compteur remis par Kreative débloque la fiche, même si le navigateur disait 2
await pg.evaluate(() => localStorage.setItem('fiche:nb_envois', JSON.stringify({ TURNLY_10_bc5e: 2 })));
await pg.goto(B + '/fiche/?projet=TURNLY_10_bc5e&integre=1'); await pg.waitForFunction(() => typeof PRJ !== 'undefined' && PRJ && PRJ.dossier === 'TURNLY_10_bc5e', null, { timeout: 20000 });
await pg.waitForTimeout(500);
const nbServeur = JSON.parse(fs.readFileSync(new URL('fixtures/TURNLY_10_bc5e/envois.json', import.meta.url))).envois.length;
t('compte d\'envois relu sur le serveur (' + nbServeur + '), pas celui du navigateur (2)', await pg.evaluate(() => nbEnvois('TURNLY_10_bc5e')) === nbServeur, await pg.evaluate(() => nbEnvois('TURNLY_10_bc5e')));
t('aucune erreur JavaScript', !err.length, err.join(' | '));
await nav.close();
console.log('\n' + ok + ' ok, ' + ko + ' en échec');

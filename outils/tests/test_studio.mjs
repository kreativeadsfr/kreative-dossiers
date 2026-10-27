// Studio (studio.kreativeads.fr) : programmer des reels Instagram (normal ou d'essai) et lire leurs statistiques.
// Tout passe par un faux Instagram (fauxgithub.mjs, /ig/…) : rien ne part sur un vrai compte.
// Usage : node test_studio.mjs config-test.json  (depuis outils/tests)
import fs from 'node:fs'; import http from 'node:http';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
const connecter = async mdp => cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp, suite: '/' }) }));
const A = await connecter(sec.ACCES.dario), S = await connecter(sec.ACCES.strategiste);
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const lignes = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
// une requête avec un autre nom d'hôte (studio.kreativeads.fr), comme en vrai
const surStudio = (chemin, o = {}) => new Promise((ok_, ko_) => {
  const r = http.request({ host: '127.0.0.1', port: 8787, path: chemin, method: o.method || 'GET', headers: { Host: 'studio.kreativeads.fr', ...(o.headers || {}) } }, res => {
    let b = ''; res.on('data', c => b += c); res.on('end', () => ok_({ status: res.statusCode, headers: res.headers, corps: b })); });
  r.on('error', ko_); if (o.body) r.write(o.body); r.end();
});
const video = (n = 4096) => Buffer.concat([Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]), Buffer.alloc(n - 12, 7)]);
const deposer = async (ck, nom, type = 'video/mp4', corps = video()) => { const r = await get('/api/studio/videos?nom=' + encodeURIComponent(nom), { method: 'PUT', headers: { Cookie: ck, 'Content-Type': type }, body: corps }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
fs.rmSync('ig.log', { force: true });

// ---------- réservé à l'admin ----------
t('sans connexion : l\'API du Studio est fermée', (await api('/api/studio', '')).s === 401);
t('la stratégiste n\'a pas accès au Studio', (await api('/api/studio', S)).s === 403);
t('… ni à sa page', [302, 303].includes((await get('/studio/', { headers: { Cookie: S } })).status));
let r = await api('/api/studio', A);
t('l\'admin ouvre le Studio : Instagram pas encore connecté', r.s === 200 && r.d.compte.connecte === false && r.d.videos.length === 0, JSON.stringify(r.d));
t('la page du Studio s\'affiche pour l\'admin', /<title>Studio · Kreative<\/title>/.test(await (await get('/studio/', { headers: { Cookie: A } })).text()));

// ---------- studio.kreativeads.fr ----------
let h = await surStudio('/');
t('studio.kreativeads.fr sans connexion : page de connexion', h.status === 302 && /\/_connexion\?suite=%2F/.test(h.headers.location || ''), JSON.stringify(h.headers));
h = await surStudio('/_connexion', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ mdp: sec.ACCES.dario, suite: '/' }).toString() });
t('… après connexion, on reste sur le Studio (pas l\'admin)', h.status === 303 && h.headers.location === '/', h.headers.location);
h = await surStudio('/', { headers: { Cookie: A } });
t('studio.kreativeads.fr connecté : la page du Studio', h.status === 200 && /Studio · Kreative/.test(h.corps));
h = await surStudio('/', { headers: { Cookie: S } });
t('… refusée à la stratégiste', h.status === 403);
h = await surStudio('/manifest.webmanifest');
const man = JSON.parse(h.corps || '{}');
t('l\'app « Kreative Studio » s\'installe (manifeste public, ses icônes noires)', h.status === 200 && man.name === 'Kreative Studio' && man.start_url === '/' && man.icons.every(x => /app-icon-studio-/.test(x.src)), h.corps);
t('… ses icônes existent', (await Promise.all(man.icons.map(x => get(x.src)).concat([get('/app-icon-studio-apple.png')]))).every(r => r.status === 200));
t('… et l\'app admin garde les siennes', (await (await get('/admin/manifest.webmanifest')).json()).icons.every(x => /app-icon-admin-/.test(x.src)));
t('app.kreativeads.fr ne change pas : l\'admin arrive toujours sur /admin/', (await get('/', { headers: { Cookie: A } })).headers.get('location') === '/admin/');

// ---------- la connexion Instagram ----------
r = await api('/api/studio/connexion', A, 'POST', { token: 'mauvais' });
t('un token trop court est refusé', r.s === 400);
r = await api('/api/studio/connexion', A, 'POST', { token: 'mauvais'.padEnd(30, 'x').replace(/x+$/, '') + 'xxxxxxxxxxxxxxxxxxxxxxx' });
t('un token refusé par Instagram : message clair', r.s === 400 && /ne marche pas|Instagram/.test(r.d.erreur), JSON.stringify(r.d));
const TOKEN = 'tok_valide_' + 'a'.repeat(30);
r = await api('/api/studio/connexion', A, 'POST', { token: TOKEN });
t('un bon token : connecté à @kreative.ads', r.s === 200 && r.d.username === 'kreative.ads', JSON.stringify(r.d));
r = await api('/api/studio', A);
t('… le compte s\'affiche (abonnés)', r.d.compte.connecte && r.d.compte.username === 'kreative.ads' && r.d.compte.abonnes >= 1200, JSON.stringify(r.d.compte));
t('… le token n\'est jamais renvoyé à la page', !JSON.stringify(r.d).includes(TOKEN));
r = await api('/api/studio/formats', A, 'PUT', { formats: ['Face cam', 'Voix off', 'Face cam', ' '] });
t('les formats s\'enregistrent (sans doublon ni vide)', r.s === 200 && JSON.stringify(r.d.formats) === '["Face cam","Voix off"]', JSON.stringify(r.d));

// ---------- déposer une vidéo ----------
r = await deposer(A, 'image.png', 'image/png');
t('une image est refusée (MP4 ou MOV seulement)', r.s === 415);
t('la stratégiste ne peut rien déposer', (await deposer(S, 'x.mp4')).s === 403);
r = await deposer(A, 'Reel 1.mp4');
const v1 = r.d;
t('une vidéo déposée devient un brouillon', r.s === 200 && v1.statut === 'brouillon' && /^\/_studio\/video\/sv_\w+-\w{24}\.mp4$/.test(v1.apercu), JSON.stringify(r.d));
let p = await get(v1.apercu);
t('Instagram peut lire la vidéo à son adresse (sans connexion)', p.status === 200 && p.headers.get('content-type') === 'video/mp4' && (await p.arrayBuffer()).byteLength === 4096);
p = await get(v1.apercu, { headers: { Range: 'bytes=0-99' } });
t('… y compris par morceaux (Range)', p.status === 206 && (p.headers.get('content-range') || '').startsWith('bytes 0-99/4096') && (await p.arrayBuffer()).byteLength === 100, p.status + ' ' + p.headers.get('content-range'));
t('… mais pas sans son jeton', (await get(v1.apercu.replace(/-\w{24}\.mp4$/, '-' + 'A'.repeat(24) + '.mp4'))).status === 404);

// ---------- programmer ----------
r = await api('/api/studio/videos/' + v1.id, A, 'PATCH', { legende: 'Test', programmer: true });
t('programmer sans date : refusé', r.s === 400);
r = await api('/api/studio/videos/' + v1.id, A, 'PATCH', { legende: Array.from({ length: 31 }, (_, n) => '#tag' + n).join(' ') });
t('plus de 30 hashtags : refusé', r.s === 400 && /30 hashtags/.test(r.d.erreur));
const dans1h = Date.now() + 3600e3;
r = await api('/api/studio/videos/' + v1.id, A, 'PATCH', { legende: 'Les 3 erreurs des ads statiques #meta', format: 'Face cam', essai: true, essai_auto: false, publier_le: dans1h, programmer: true });
t('programmé dans 1 h : reel d\'essai, format Face cam', r.s === 200 && r.d.statut === 'programme' && r.d.essai && r.d.format === 'Face cam' && r.d.publier_le === dans1h, JSON.stringify(r.d));
r = await api('/api/studio/avancer', A, 'POST');
t('pas encore l\'heure : rien ne part', r.d.lances === 0 && !lignes('ig.log').some(x => x.quoi === 'conteneur'));
r = await api('/api/studio/videos/' + v1.id, A, 'PATCH', { programmer: false });
t('« Modifier » le remet à programmer', r.d.statut === 'brouillon');
r = await api('/api/studio/videos/' + v1.id, A, 'PATCH', { publier_le: Date.now() - 1000, programmer: true });

// ---------- publier : reel d'essai ----------
const debut = Date.now();
r = await api('/api/studio/avancer', A, 'POST');
let L = lignes('ig.log'), c = L.find(x => x.quoi === 'conteneur');
t('à l\'heure : le conteneur Instagram est créé avec la vidéo et la légende', c && c.media_type === 'REELS' && /\/_studio\/video\/sv_\w+-\w{24}\.mp4$/.test(c.video_url) && c.caption === 'Les 3 erreurs des ads statiques #meta', JSON.stringify(c));
t('… en reel d\'essai (passage aux abonnés à la main)', c && JSON.parse(c.trial_params || '{}').graduation_strategy === 'MANUAL' && !('share_to_feed' in c), JSON.stringify(c));
t('… le token ne part pas dans les journaux de test', !fs.readFileSync('ig.log', 'utf8').includes(TOKEN));
r = await api('/api/studio', A);
let V = r.d.videos.find(x => x.id === v1.id);
t('… Instagram a fini de traiter la vidéo : publiée', V.statut === 'publie' && /^media_\d+$/.test(V.media_id) && /instagram\.com\/reel\//.test(V.permalink), JSON.stringify(V) + ' en ' + (Date.now() - debut) + ' ms');
t('… le reel rejoint les statistiques, avec son format et « essai »', r.d.medias.some(m => m.id === V.media_id && m.format === 'Face cam' && m.essai), JSON.stringify(r.d.medias));
t('une vidéo publiée ne se modifie plus', (await api('/api/studio/videos/' + v1.id, A, 'PATCH', { legende: 'x' })).s === 409);

// ---------- publier maintenant : reel normal, sans la grille ----------
const v2 = (await deposer(A, 'Reel 2.mov', 'video/quicktime')).d;
await api('/api/studio/videos/' + v2.id, A, 'PATCH', { legende: 'Avant / après', format: 'Voix off', essai: false, partage_fil: false });
r = await api('/api/studio/videos/' + v2.id + '/maintenant', A, 'POST');
c = lignes('ig.log').filter(x => x.quoi === 'conteneur').pop();
t('« Publier maintenant » : reel normal, pas dans la grille', c.share_to_feed === 'false' && !c.trial_params, JSON.stringify(c));
t('… publié', r.s === 200 && r.d.video.statut === 'publie', JSON.stringify(r.d));

// ---------- reel d'essai qui passe tout seul aux abonnés ----------
const v3 = (await deposer(A, 'Reel 3.mp4')).d;
await api('/api/studio/videos/' + v3.id, A, 'PATCH', { essai: true, essai_auto: true });
await api('/api/studio/videos/' + v3.id + '/maintenant', A, 'POST');
c = lignes('ig.log').filter(x => x.quoi === 'conteneur').pop();
t('reel d\'essai « automatique » : Instagram le passe aux abonnés s\'il marche', JSON.parse(c.trial_params || '{}').graduation_strategy === 'SS_PERFORMANCE', JSON.stringify(c));

// ---------- une vidéo refusée par Instagram ----------
const v4 = (await deposer(A, 'Mauvais.mp4')).d;
await api('/api/studio/videos/' + v4.id, A, 'PATCH', { legende: 'echec volontaire' });
r = await api('/api/studio/videos/' + v4.id + '/maintenant', A, 'POST');
t('une vidéo refusée : en erreur, avec une explication en français', r.d.video.statut === 'erreur' && /Instagram refuse cette vidéo/.test(r.d.video.erreur), JSON.stringify(r.d.video));
await api('/api/studio/videos/' + v4.id, A, 'PATCH', { legende: 'Corrigée' });
r = await api('/api/studio/videos/' + v4.id + '/maintenant', A, 'POST');
t('… « Réessayer » après correction : publiée', r.d.video.statut === 'publie' && !r.d.video.erreur, JSON.stringify(r.d.video));

// ---------- les statistiques ----------
r = await api('/api/studio/actualiser', A, 'POST');
t('« Actualiser » lit les statistiques', r.s === 200 && r.d.ok && r.d.reels >= 4, JSON.stringify(r.d));
r = await api('/api/studio', A);
const M1 = r.d.medias.find(m => m.id === V.media_id), EXT = r.d.medias.find(m => m.id === 'media_ext90');
t('chaque reel a ses vues, likes, partages, abonnés, visionnage', M1 && M1.stats.views > 0 && M1.stats.likes > 0 && M1.stats.shares > 0 && M1.stats.follows > 0 && M1.stats.ig_reels_avg_watch_time > 0, JSON.stringify(M1));
t('les vidéos publiées depuis l\'app comptent aussi', EXT && EXT.stats.views > 0 && EXT.legende === 'Un reel posté depuis l\'app', JSON.stringify(EXT));
t('… une métrique refusée par Instagram n\'empêche pas les autres', EXT && EXT.stats.follows == null && EXT.stats.likes > 0);
t('les nouveaux abonnés par jour sont gardés', r.d.jours.some(j => j.gagnes === 12) && r.d.jours.some(j => j.abonnes >= 1200), JSON.stringify(r.d.jours));
fs.rmSync('ig.log', { force: true });
await api('/api/studio/actualiser', A, 'POST');
const S2 = lignes('ig.log').filter(x => x.quoi === 'stats' && x.id === 'media_ext90');
t('… et n\'est plus redemandée ensuite pour ce type de vidéo', S2.length === 1 && !S2[0].metric.split(',').includes('follows'), JSON.stringify(S2));
t('… mais toujours pour les reels', lignes('ig.log').some(x => x.quoi === 'stats' && x.id !== 'media_ext90' && x.metric.split(',').includes('follows')));
// un reel dont Instagram refuse toutes les statistiques (reel d'essai…) ne doit pas faire tout passer à 0
const illisible = (id, on) => fetch('http://127.0.0.1:9911/ig/_illisible', { method: 'POST', body: 'id=' + id + '&on=' + (on ? 1 : 0) });
await illisible('media_ill95', true); await illisible(V.media_id, true);
fs.rmSync('ig.log', { force: true });
await api('/api/studio/actualiser', A, 'POST'); await api('/api/studio/actualiser', A, 'POST');
r = await api('/api/studio', A);
const ILL = r.d.medias.find(m => m.id === 'media_ill95'), M1b = r.d.medias.find(m => m.id === V.media_id), AUTRE = r.d.medias.find(m => m.id !== V.media_id && m.id !== 'media_ill95' && m.id !== 'media_ext90' && m.stats_le);
t('un reel sans statistiques : likes et commentaires lus avec la liste', ILL && ILL.stats.likes === 7 && ILL.stats.comments === 2 && ILL.stats.views == null, JSON.stringify(ILL));
t('… ses statistiques déjà lues ne sont pas effacées', M1b && M1b.stats.views > 0 && M1b.stats.likes > 0, JSON.stringify(M1b));
t('… les autres reels gardent toutes leurs statistiques (rien n\'est retenu comme refusé)', AUTRE && AUTRE.stats.views > 0 && lignes('ig.log').filter(x => x.quoi === 'stats' && x.id === AUTRE.id).every(x => x.metric.split(',').includes('views')), JSON.stringify(AUTRE));
t('… la raison d\'Instagram est affichée', /Insights are not available/.test(r.d.compte.stats_erreur) && !r.d.compte.erreur, JSON.stringify(r.d.compte));
await illisible('media_ill95', false); await illisible(V.media_id, false);
await api('/api/studio/actualiser', A, 'POST');
t('… et disparaît quand tout se relit', !(await api('/api/studio', A)).d.compte.stats_erreur);
r = await api('/api/studio/medias/media_ext90', A, 'PATCH', { format: 'Voix off', essai: false });
t('on donne un format à un reel publié depuis l\'app', r.s === 200 && (await api('/api/studio', A)).d.medias.find(m => m.id === 'media_ext90').format === 'Voix off');
r = await api('/api/studio/formats', A, 'PUT', { formats: ['Face cam', 'Narration'], renomme: { de: 'Voix off', vers: 'Narration' } });
r = await api('/api/studio', A);
t('renommer un format le renomme sur ses vidéos', r.d.medias.filter(m => m.format === 'Narration').length >= 2 && !r.d.medias.some(m => m.format === 'Voix off'), JSON.stringify(r.d.medias.map(m => m.format)));

// ---------- supprimer ----------
const v5 = (await deposer(A, 'A jeter.mp4')).d;
r = await api('/api/studio/videos/' + v5.id, A, 'DELETE');
t('supprimer un brouillon l\'efface (et sa vidéo)', r.s === 200 && !(await api('/api/studio', A)).d.videos.some(x => x.id === v5.id) && (await get(v5.apercu)).status === 404);
r = await api('/api/studio/videos/' + v1.id, A, 'DELETE');
r = await api('/api/studio', A);
t('supprimer un reel publié retire le fichier, le reel reste dans les statistiques', !r.d.videos.some(x => x.id === v1.id) && r.d.medias.some(m => m.id === V.media_id));

// ---------- Meta bloque l'accès (« API access blocked », code 200) : rien n'est perdu ----------
const bloquer = on => fetch('http://127.0.0.1:9911/ig/_bloquer', { method: 'POST', body: 'on=' + (on ? 1 : 0) });
await bloquer(true);
const vb1 = (await deposer(A, 'Bloque 1.mp4')).d, vb2 = (await deposer(A, 'Bloque 2.mp4')).d, vb3 = (await deposer(A, 'Bloque 3.mp4')).d;
await api('/api/studio/videos/' + vb1.id, A, 'PATCH', { legende: 'B1', publier_le: Date.now() - 60 * 60e3, programmer: true });
await api('/api/studio/videos/' + vb2.id, A, 'PATCH', { legende: 'B2', publier_le: Date.now() - 50 * 60e3, programmer: true });
await api('/api/studio/videos/' + vb3.id, A, 'PATCH', { legende: 'B3', publier_le: Date.now() + 3 * 864e5, programmer: true });
r = await api('/api/studio/avancer', A, 'POST');
let SB = (await api('/api/studio', A)).d, sb = id => SB.videos.find(x => x.id === id);
t('Meta bloque : les reels arrivés à l\'heure restent programmés (pas en erreur)', r.s === 200 && r.d.bloque && sb(vb1.id).statut === 'programme' && sb(vb2.id).statut === 'programme' && sb(vb3.id).statut === 'programme', JSON.stringify(r.d) + ' ' + sb(vb1.id).statut);
t('… le Studio dit clairement quoi faire (developers.facebook.com)', /developers\.facebook\.com/.test(SB.compte.erreur) && /restent programmés/.test(SB.compte.erreur), SB.compte.erreur);
r = await api('/api/studio/videos/' + vb3.id + '/maintenant', A, 'POST');
t('« Publier maintenant » pendant le blocage : le reel reste programmé, pas d\'erreur', r.s === 200 && r.d.video.statut === 'programme' && !r.d.video.erreur, JSON.stringify(r.d).slice(0, 200));
r = await api('/api/studio/actualiser', A, 'POST');
t('les statistiques pendant le blocage : pas de plantage, le message reste', r.s === 200 && /bloque/.test((await api('/api/studio', A)).d.compte.erreur), r.s + ' ' + JSON.stringify(r.d).slice(0, 160));
await bloquer(false);
r = await api('/api/studio/avancer', A, 'POST');
SB = (await api('/api/studio', A)).d;
t('accès rétabli : un seul reel en retard part par passage (pas tout d\'un coup), « Publier maintenant » part aussi', sb(vb1.id).statut === 'publie' && sb(vb2.id).statut === 'programme' && sb(vb3.id).statut === 'publie', [vb1, vb2, vb3].map(v => sb(v.id).statut).join(','));
t('… et le message d\'erreur disparaît', !SB.compte.erreur, SB.compte.erreur);
r = await api('/api/studio/avancer', A, 'POST'); r = await api('/api/studio/avancer', A, 'POST');
SB = (await api('/api/studio', A)).d;
t('… puis les suivants, au fil des passages', [vb1, vb2, vb3].every(v => sb(v.id).statut === 'publie'), [vb1, vb2, vb3].map(v => sb(v.id).statut).join(','));

// ---------- retirer un reel publié du Studio, et les reels archivés sur Instagram ----------
const archiver = (id, on) => fetch('http://127.0.0.1:9911/ig/_archiver', { method: 'POST', body: 'id=' + id + '&on=' + (on ? 1 : 0) });
SB = (await api('/api/studio', A)).d;
const pubB = SB.videos.find(x => x.id === vb2.id), mB = pubB && pubB.media_id;
r = await api('/api/studio/medias/' + mB, A, 'DELETE');
SB = (await api('/api/studio', A)).d;
t('« Retirer du Studio » : le reel disparaît (Vidéos et calendrier), sa vidéo aussi', r.s === 200 && !SB.medias.some(x => x.id === mB) && !SB.videos.some(x => x.id === vb2.id), r.s + ' ' + JSON.stringify(r.d));
t('… et ne revient pas à la mise à jour suivante', (await api('/api/studio/actualiser', A, 'POST')).s === 200 && !(await api('/api/studio', A)).d.medias.some(x => x.id === mB));
r = await api('/api/studio/medias/' + mB, S, 'DELETE'); t('retirer est réservé à l\'admin', r.s === 401 || r.s === 403, r.s);
const mC = (await api('/api/studio', A)).d.videos.find(x => x.id === vb3.id).media_id;
await archiver(mC, true);
await api('/api/studio/actualiser', A, 'POST'); SB = (await api('/api/studio', A)).d;
t('un reel archivé dans l\'app Instagram disparaît tout seul du Studio', !SB.medias.some(x => x.id === mC) && !SB.videos.some(x => x.id === vb3.id), SB.medias.map(x => x.id).join(','));
t('… les autres reels restent', SB.medias.some(x => x.id === 'media_ext90'), SB.medias.map(x => x.id).join(','));
await archiver(mC, false);
await api('/api/studio/actualiser', A, 'POST');
t('… et revient s\'il est désarchivé', (await api('/api/studio', A)).d.medias.some(x => x.id === mC));

// ---------- déconnexion ----------
r = await api('/api/studio/connexion', A, 'DELETE');
r = await api('/api/studio', A);
t('déconnecter Instagram : plus de token, les statistiques restent', !r.d.compte.connecte && r.d.medias.length >= 4);
const v6 = (await deposer(A, 'Sans compte.mp4')).d;
await api('/api/studio/videos/' + v6.id, A, 'PATCH', { publier_le: Date.now() - 1000, programmer: true });
r = await api('/api/studio/avancer', A, 'POST');
t('sans Instagram connecté, rien ne part (la vidéo attend)', r.d.connecte === false && (await api('/api/studio', A)).d.videos.find(x => x.id === v6.id).statut === 'programme');
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

// Wimmov : un client à part (abonnement 1 200 €/mois, 60 créas livrées par Kreative elle-même).
// Son espace, ses retours de la semaine, ses tarifs, l'accès du media buyer, et surtout :
// le stratégiste et la designer ne le voient jamais, les autres clients ne changent pas.
// Usage : node test_wimmov.mjs config-test.json  (depuis outils/tests)
import fs from 'node:fs'; import crypto from 'node:crypto';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
const connecter = async mdp => cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp, suite: '/' }) }));
const A = await connecter(sec.ACCES.dario), S = await connecter(sec.ACCES.strategiste), DZ = await connecter(sec.ACCES.andrea);
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const webhook = async ev => {
  const corps = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test_faux').update(ts + '.' + corps).digest('hex');
  return (await get('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=' + ts + ',v1=' + sig, 'Content-Type': 'application/json' }, body: corps })).status;
};
const lignes = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : [];
const pause = ms => new Promise(x => setTimeout(x, ms));
const emails = () => lignes('emails.log').map(l => JSON.parse(l).corps);
const png = (l, h) => { // un vrai PNG (en-tête + IHDR) de la bonne taille
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); ihdr.write('IHDR', 4); ihdr.writeUInt32BE(l, 8); ihdr.writeUInt32BE(h, 12); ihdr[16] = 8; ihdr[17] = 6;
  return Buffer.concat([sig, ihdr, Buffer.alloc(12)]);
};
for (const f of ['emails.log', 'stripe.log', 'stripe_abo.log', 'livraison.log']) fs.rmSync(f, { force: true });

// ---------- l'espace ----------
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Wimmov', contact: 'Hugo Raffaelli', email: 'hugo.raffaelli@wimmov.com', telephone: '07 00 00 00 00', site: 'wimmov.com' });
const wid = r.d.id; const W = cookie(await get(r.d.lien.replace(B, '')));
r = await api('/api/admin/clients', A, 'POST', { marque: 'Lumen', contact: 'Sara', email: 'sara@lumen.fr' });
const lid = r.d.id; const L = cookie(await get(r.d.lien.replace(B, '')));
let h = await (await get('/client/', { headers: { Cookie: W } })).text();
t('Wimmov arrive sur son propre espace', h.includes('<title>Espace Wimmov · Kreative</title>') && h.includes('/api/client/wimmov'));
t('Wimmov a l\'onglet App pour installer l\'espace sur son téléphone', h.includes("href: '#/app'") && h.includes('function ecranApp') && h.includes('Sur l\\\'écran d\\\'accueil'));
t('Wimmov n\'a pas de section « Nous contacter »', !h.includes('Nous contacter') && !h.includes('#/contact'));
h = await (await get('/client/', { headers: { Cookie: L } })).text();
t('un autre client garde l\'espace classique', h.includes('<title>Espace client · Kreative</title>') && !h.includes('/api/client/wimmov'));
h = await (await get('/client/?client=' + wid, { headers: { Cookie: A } })).text();
t('l\'aperçu admin de Wimmov montre son espace', h.includes('Espace Wimmov'));
r = await api('/api/client/wimmov', W);
t('ses données : contrat 60 créas, 1 200 €, 4 livraisons, ses tarifs', r.s === 200 && r.d.contrat.creas_mois === 60 && r.d.contrat.prix_mois === 1200 && r.d.contrat.livraisons_mois === 4 &&
  r.d.tarifs.packs.map(p => p.nb + ':' + p.prix).join(',') === '6:180,12:280,24:490' && r.d.tarifs.au_dela === 20 && /\/acces\//.test(r.d.lien), JSON.stringify(r.d).slice(0, 300));
t('un autre client n\'a pas d\'espace Wimmov', (await api('/api/client/wimmov', L)).s === 404);
t('Wimmov ne commande pas les packs classiques', (await api('/api/client/paiement', W, 'POST', { pack: 'growth', formule: 'unique' })).s === 403);
t('Wimmov ne résilie pas depuis son espace', (await api('/api/client/abonnement/resilier', W, 'POST', { abo: 'sub_x' })).s === 403);
t('… mais un autre client garde le paiement classique', (await api('/api/client/paiement', L, 'POST', { pack: 'growth', formule: 'unique' })).s === 200);

// ---------- le paiement de son abonnement (lien Stripe « Pack ULTRA ») ----------
const avantEmails = emails().length;
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_wim1', mode: 'subscription', payment_status: 'paid', amount_total: 120000, customer: 'cus_wim',
  subscription: 'sub_wim', invoice: 'in_w1', payment_link: 'plink_1UJxUZBaFgfyJZxjJCQHpo2g', customer_details: { email: 'Hugo.raffaelli@wimmov.com' }, metadata: {} } } });
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_w1', status: 'paid', number: 'KRV-0100', billing_reason: 'subscription_create', parent: { subscription_details: { subscription: 'sub_wim', metadata: {} } },
  total: 120000, customer: 'cus_wim', created: 1, status_transitions: { paid_at: 1 } } } });
r = await api('/api/admin/wimmov', A);
let k = r.d.commandes[0];
t('le paiement crée le mois : 60 créas, 1 200 €, abonnement, en production, dossier caché', r.d.commandes.length === 1 && k.nb_creas === 60 && k.prix === 1200 && k.formule === 'mensuel' && k.statut === 'production' && /^WIMMOV_/.test(k.dossier), JSON.stringify(k));
t('… la facture Stripe donne son numéro au mois', k.ref === 'KRV-0100', k.ref);
t('… aucun email de brief ni d\'accès (Wimmov existe déjà)', emails().length === avantEmails, JSON.stringify(emails().slice(avantEmails)));
t('… aucun mois en double chez un autre client', (await api('/api/admin/clients/' + lid, A)).d.commandes.length === 0);

// ---------- Kreative livre (admin) ----------
r = await api('/api/admin/wimmov/livraisons', A, 'POST', { commande_id: k.id });
const l1 = r.d;
t('nouvelle livraison : brouillon « _L1 » du mois', r.s === 200 && l1.statut === 'brouillon' && l1.dossier === k.dossier + '_L1', JSON.stringify(r.d).slice(0, 200));
r = await api('/api/admin/wimmov/livraisons', A, 'POST', { commande_id: k.id });
t('… redemander reprend le même brouillon', r.d.id === l1.id);
const deposer = async (ck, liv, nom, l, hh, fmt) => (await get('/api/equipe/fichiers?livraison=' + liv + '&format=' + fmt + '&nom=' + nom + '&l=' + l + '&h=' + hh, { method: 'PUT', headers: { Cookie: ck, 'Content-Type': 'image/png' }, body: png(l, hh) })).status;
t('Kreative dépose les PNG', await deposer(A, l1.id, 'WIMMOV_STANDARD_01.png', 1080, 1080, '1x1') === 200 && await deposer(A, l1.id, 'WIMMOV_FEED_01.png', 1080, 1350, '4x5') === 200 && await deposer(A, l1.id, 'WIMMOV_REELS_01.png', 1080, 1920, '9x16') === 200);
t('la designer ne peut rien déposer dans une livraison Wimmov', await deposer(DZ, l1.id, 'x.png', 1080, 1080, '1x1') === 404);
r = await api('/api/client/wimmov', W);
t('un brouillon n\'est pas visible par Wimmov', r.d.commandes[0].livraisons.length === 0, JSON.stringify(r.d.commandes[0].livraisons));
const tg = lignes('livraison.log').length;
r = await api('/api/admin/wimmov/livraisons/' + l1.id + '/envoyer', A, 'POST'); await pause(400);
t('envoyer à Wimmov', r.s === 200 && /Livraison 1 envoyée/.test(r.d.message), JSON.stringify(r.d));
t('… aucun Telegram (livraison designer) ne part', lignes('livraison.log').length === tg);
let E = emails().filter(e => e.type === 'creatives');
t('… email « Livraison 1 disponible » à Hugo', E.length === 1 && E[0].a === 'hugo.raffaelli@wimmov.com' && /Livraison 1 disponible/.test(E[0].sujet), JSON.stringify(E));
t('… le mois reste en production (1 livraison sur 4)', (await api('/api/admin/wimmov', A)).d.commandes[0].statut === 'production');
t('… déjà envoyée : pas deux fois', (await api('/api/admin/wimmov/livraisons/' + l1.id + '/envoyer', A, 'POST')).s === 409);
r = await api('/api/client/wimmov', W);
t('Wimmov voit la livraison 1 (1 créative, 3 fichiers)', r.d.commandes[0].livraisons.length === 1 && r.d.commandes[0].livraisons[0].n === 1 && r.d.commandes[0].livraisons[0].creatives === 1 && r.d.commandes[0].livrees === 1, JSON.stringify(r.d.commandes[0]));
r = await api('/api/client/commandes/' + k.id + '/creatives', W);
const fic = r.d.livraisons[0].fichiers[0];
t('… et ses fichiers', r.d.livraisons.length === 1 && r.d.livraisons[0].fichiers.length === 3);
t('… qu\'il peut télécharger', (await get(fic.url, { headers: { Cookie: W } })).status === 200);
t('un autre client ne peut pas les ouvrir', (await get(fic.url, { headers: { Cookie: L } })).status === 403);

// ---------- l'équipe ne voit jamais Wimmov ----------
for (const [qui, ck] of [['stratégiste', S], ['designer', DZ]]) {
  r = await api('/api/equipe/livraisons', ck);
  if (r.s === 200) t(qui + ' : aucune livraison Wimmov dans la liste', !r.d.some(x => /^WIMMOV_/.test(x.dossier)), JSON.stringify(r.d.map(x => x.dossier)));
  t(qui + ' : la livraison Wimmov n\'existe pas', (await api('/api/equipe/livraisons/' + l1.dossier, ck)).s === 404);
  r = await api('/api/equipe/etats', ck);
  t(qui + ' : rien de Wimmov dans l\'état de la production', r.s === 200 && !JSON.stringify(r.d).includes('WIMMOV_'), JSON.stringify(r.d).slice(0, 200));
  t(qui + ' : ses fichiers sont introuvables', (await get(fic.url, { headers: { Cookie: ck } })).status === 404);
  t(qui + ' : impossible de commenter ses créatives', (await api('/api/equipe/commentaires', ck, 'POST', { fichier_id: fic.id, texte: 'test' })).s === 404);
}
t('designer : impossible de créer une livraison Wimmov', (await api('/api/equipe/livraisons', DZ, 'POST', { dossier: k.dossier + '_L2' })).s === 404);
r = await api('/api/equipe/etats', A);
t('l\'admin, lui, voit tout', JSON.stringify(r.d).includes('WIMMOV_'));

// ---------- une nouvelle version ----------
r = await api('/api/admin/wimmov/livraisons', A, 'POST', { dossier: l1.dossier });
t('nouvelle version de la livraison 1 : reprend les 3 fichiers', r.s === 200 && r.d.version === 2 && r.d.fichiers.length === 3, JSON.stringify(r.d).slice(0, 200));
await deposer(A, r.d.id, 'WIMMOV_STANDARD_01.png', 1080, 1080, '1x1');
await api('/api/admin/wimmov/livraisons/' + r.d.id + '/envoyer', A, 'POST'); await pause(400);
E = emails().filter(e => e.type === 'creatives');
t('… email « nouvelle version »', /Livraison 1 : nouvelle version/.test(E[E.length - 1].sujet), E[E.length - 1].sujet);
r = await api('/api/admin/wimmov/livraisons', A, 'POST', { commande_id: k.id });
t('livraison suivante : « _L2 »', r.d.dossier === k.dossier + '_L2', r.d.dossier);

// ---------- l'accès partagé (le media buyer) ----------
r = await api('/api/client/wimmov/acces', W, 'PATCH', { emails: ['Media@Wimmov.com', 'pas-un-email', 'hugo.raffaelli@wimmov.com'] }); await pause(400);
t('Hugo ajoute son media buyer (adresse propre, sans lui-même ni l\'invalide)', r.s === 200 && JSON.stringify(r.d.emails) === '["media@wimmov.com"]', JSON.stringify(r.d));
E = emails().filter(e => e.type === 'acces');
t('… le media buyer reçoit tout de suite le lien de l\'espace Wimmov', E.length === 1 && E[0].a === 'media@wimmov.com' && /espace Kreative/.test(E[0].sujet) && /retours de la semaine/.test(E[0].html), JSON.stringify(E).slice(0, 300));
const nE = emails().length;
await get('/api/client/lien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'media@wimmov.com' }) });
await new Promise(x => setTimeout(x, 300));
t('le media buyer peut redemander le lien avec son email', emails().slice(nE).some(e => e.type === 'acces' && e.a === 'media@wimmov.com'));
const l2 = (await api('/api/admin/wimmov/livraisons', A, 'POST', { commande_id: k.id })).d;
await deposer(A, l2.id, 'WIMMOV_STANDARD_02.png', 1080, 1080, '1x1');
const nC = emails().filter(e => e.type === 'creatives').length;
await api('/api/admin/wimmov/livraisons/' + l2.id + '/envoyer', A, 'POST'); await pause(400);
E = emails().filter(e => e.type === 'creatives').slice(nC);
t('après 2 livraisons sur 4, toujours en production', (await api('/api/admin/wimmov', A)).d.commandes.find(x => x.id === k.id).statut === 'production');
t('une livraison part à Hugo ET au media buyer', E.map(e => e.a).sort().join(',') === 'hugo.raffaelli@wimmov.com,media@wimmov.com', JSON.stringify(E.map(e => e.a)));

// ---------- les retours de la semaine ----------
r = await api('/api/client/wimmov/retours', W, 'POST'); const rid = r.d.id;
t('brouillon de retours', r.s === 200 && /^wr_/.test(rid));
t('le même brouillon revient tant qu\'il n\'est pas envoyé', (await api('/api/client/wimmov/retours', W, 'POST')).d.id === rid);
t('rien d\'écrit, pas de lien valable, pas de fichier : refusé', (await api('/api/client/wimmov/retours/' + rid + '/envoyer', W, 'POST', { texte: '  ', liens: ['javascript:alert(1)'] })).s === 400);
let p = await get('/api/client/wimmov/pieces?retour=' + rid + '&nom=' + encodeURIComponent('Rapport semaine 42.pdf'), { method: 'PUT', headers: { Cookie: W, 'Content-Type': 'application/pdf' }, body: Buffer.from('%PDF-1.4 test') });
let pj = await p.json();
t('Wimmov joint un fichier (PDF)', p.status === 200 && /^wp_/.test(pj.id), JSON.stringify(pj));
t('Lumen ne peut pas joindre à ses retours', (await get('/api/client/wimmov/pieces?retour=' + rid + '&nom=x.pdf', { method: 'PUT', headers: { Cookie: L, 'Content-Type': 'application/pdf' }, body: Buffer.from('x') })).status === 404);
const nR = emails().length;
r = await api('/api/client/wimmov/retours/' + rid + '/envoyer', W, 'POST', { texte: 'Les créas 3 et 7 ont cartonné.\nPlus de témoignages la semaine prochaine.', liens: ['wimark.wimmov.com/partage/rapport', 'javascript:alert(1)'] });
await pause(400);
t('Wimmov envoie ses retours', r.s === 200, JSON.stringify(r.d));
E = emails().slice(nR).filter(e => e.type === 'wimmov_retours');
t('… Kreative reçoit un email avec le texte et le lien', E.length === 1 && /Wimmov · retours de la semaine/.test(E[0].sujet) && /cartonné/.test(E[0].html) && /https:\/\/wimark\.wimmov\.com\/partage\/rapport/.test(E[0].html) && !/javascript/.test(E[0].html), JSON.stringify(E).slice(0, 400));
t('… déjà envoyés : pas deux fois', (await api('/api/client/wimmov/retours/' + rid + '/envoyer', W, 'POST', { texte: 'x' })).s === 409);
r = await api('/api/admin/wimmov', A);
const ret = r.d.retours[0];
t('l\'admin voit les retours : texte, lien, fichier', ret && ret.liens.length === 1 && ret.pieces.length === 1 && ret.pieces[0].nom === 'Rapport semaine 42.pdf', JSON.stringify(ret));
t('l\'admin ouvre le fichier joint', (await get(ret.pieces[0].url, { headers: { Cookie: A } })).status === 200);
t('Wimmov aussi', (await get(ret.pieces[0].url, { headers: { Cookie: W } })).status === 200);
t('la designer et un autre client : non', (await get(ret.pieces[0].url, { headers: { Cookie: DZ } })).status === 403 && (await get(ret.pieces[0].url, { headers: { Cookie: L } })).status === 403);
r = await api('/api/client/wimmov', W);
t('Wimmov retrouve ses retours envoyés', r.d.retours.length === 1 && r.d.retours[0].texte.includes('cartonné'));

// ---------- des créatives en plus, à ses anciens prix ----------
const stripeLog = () => lignes('stripe.log').map(l => decodeURIComponent(l.replace(/\+/g, ' ')));
const nS = stripeLog().length;
r = await api('/api/client/wimmov/paiement', W, 'POST', { nb_creas: 12 });
let s = stripeLog().slice(nS).join('\n');
t('12 créas : 280 €, paiement en une fois, marqué Wimmov', r.s === 200 && r.d.total === 280 && /unit_amount\]=28000/.test(s) && /metadata\[wimmov\]=1/.test(s) && /mode=payment/.test(s) && /Pack Growth/.test(s), s.slice(0, 300));
t('6 créas : 180 €, 24 créas : 490 €', (await api('/api/client/wimmov/paiement', W, 'POST', { nb_creas: 6 })).d.total === 180 && (await api('/api/client/wimmov/paiement', W, 'POST', { nb_creas: 24 })).d.total === 490);
t('30 créas : 20 € la créative (600 €)', (await api('/api/client/wimmov/paiement', W, 'POST', { nb_creas: 30 })).d.total === 600);
t('7 créas : refusé', (await api('/api/client/wimmov/paiement', W, 'POST', { nb_creas: 7 })).s === 400);
const nB = emails().length;
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_wim_extra', mode: 'payment', payment_status: 'paid', amount_total: 28000, customer: 'cus_wim',
  customer_details: { email: 'hugo.raffaelli@wimmov.com' }, metadata: { wimmov: '1', kreative_client: wid, nb_creas: '12', total: '280' } } } });
r = await api('/api/admin/wimmov', A);
const extra = r.d.commandes.find(x => x.formule === 'unique');
t('le paiement crée la commande en plus : 12 créas, 280 €, en production', extra && extra.nb_creas === 12 && extra.prix === 280 && extra.statut === 'production' && /^WIMMOV_/.test(extra.dossier), JSON.stringify(r.d.commandes));
t('… sans email de brief', emails().length === nB);

// ---------- le renouvellement mensuel ----------
const nM = emails().length;
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_w2', status: 'paid', number: 'KRV-0101', billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub_wim', metadata: {} } },
  total: 120000, customer: 'cus_wim', created: 2, status_transitions: { paid_at: 2 } } } });
r = await api('/api/admin/wimmov', A);
const mois = r.d.commandes.filter(x => x.formule === 'mensuel');
t('nouveau mois payé : un 2e mois, en production, dossier caché', mois.length === 2 && mois.every(x => x.statut === 'production' && /^WIMMOV_/.test(x.dossier) && x.nb_creas === 60), JSON.stringify(mois));
t('… pas de « Votre brief de … » pour Wimmov', !emails().slice(nM).some(e => e.type === 'brief_mois') && !/^Votre brief/.test((await api('/api/client/notifications/derniere', W)).d.titre || ''));

// ---------- pas d'engagement de 3 mois pour Wimmov ----------
fs.rmSync('stripe_abo.log', { force: true });
await webhook({ type: 'customer.subscription.updated', created: Math.floor(Date.now() / 1000), data: { object: { id: 'sub_wim', status: 'active', cancel_at_period_end: true, current_period_end: Math.floor(Date.now() / 1000) + 20 * 86400,
  billing_cycle_anchor: Math.floor(Date.now() / 1000) - 10 * 86400, start_date: Math.floor(Date.now() / 1000) - 10 * 86400 } } });
t('une résiliation de Wimmov dans Stripe n\'est pas repoussée', !lignes('stripe_abo.log').length, lignes('stripe_abo.log').join(' '));
r = await api('/api/admin/wimmov', A);
t('… l\'admin voit l\'abonnement résilié', r.d.abonnements[0] && r.d.abonnements[0].statut === 'resiliation', JSON.stringify(r.d.abonnements));

// ---------- l'admin : mois à la main, lien d'accès ----------
r = await api('/api/admin/wimmov/commandes', A, 'POST', { type: 'extra', nb_creas: 24 });
r = await api('/api/admin/wimmov', A);
t('l\'admin ajoute des créatives en plus à la main (prix calculé : 490 €)', r.d.commandes.some(x => x.formule === 'unique' && x.nb_creas === 24 && x.prix === 490 && /^WIMMOV_/.test(x.dossier)));
const nL = emails().length;
r = await api('/api/admin/wimmov/lien', A, 'POST', {}); await pause(400);
E = emails().slice(nL);
t('« Envoyer le lien à tout le monde » : Hugo et le media buyer', r.s === 200 && E.map(e => e.a).sort().join(',') === 'hugo.raffaelli@wimmov.com,media@wimmov.com', JSON.stringify(E.map(e => e.a)));
const nL2 = emails().length;
r = await api('/api/admin/clients/' + wid + '/envoyer-lien', A, 'POST'); await pause(400);
t('le bouton « Envoyer le lien » de la fiche client envoie le lien Wimmov', r.s === 200 && emails().slice(nL2).every(e => /retours de la semaine/.test(e.html)) && emails().slice(nL2).length === 2);
const nL3 = emails().length;
await api('/api/admin/clients/' + lid + '/envoyer-lien', A, 'POST'); await pause(400);
t('… et pour un autre client, l\'email classique', emails().slice(nL3).length === 1 && /votre brief/.test(emails().slice(nL3)[0].html));
t('la page admin Wimmov s\'ouvre', /Wimmov · Kreative/.test(await (await get('/admin/wimmov.html', { headers: { Cookie: A } })).text()));
t('… pas pour le stratégiste', (await get('/admin/wimmov.html', { headers: { Cookie: S } })).status === 302);
t('l\'admin Wimmov est refusé aux autres', (await api('/api/admin/wimmov', S)).s === 403 && (await api('/api/admin/wimmov', W)).s === 403);
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

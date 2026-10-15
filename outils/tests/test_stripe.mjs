import fs from 'node:fs'; import crypto from 'node:crypto';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
const A = cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES.dario, suite: '/' }) }));
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const lignesStripe = () => fs.existsSync('stripe.log') ? fs.readFileSync('stripe.log', 'utf8').trim().split('\n').filter(Boolean).map(l => Object.fromEntries(new URLSearchParams(l))) : [];
const webhook = async (ev, secret = 'whsec_test_faux') => {
  const corps = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(ts + '.' + corps).digest('hex');
  const r = await get('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=' + ts + ',v1=' + sig, 'Content-Type': 'application/json' }, body: corps });
  return r.status;
};
fs.rmSync('stripe.log', { force: true });

// un client et sa session
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Nova', contact: 'Inès Roy', email: 'ines@nova.fr' });
const cid = r.d.id; const CK = cookie(await get(r.d.lien.replace(B, '')));
r = await api('/api/client/moi', CK); t('le portail sait que le paiement est branché et connaît le tarif Custom', r.d.paiement === true && r.d.custom && r.d.custom.options.length === 3);

// paiement d'un pack fixe : le prix vient du serveur
r = await api('/api/client/paiement', CK, 'POST', { pack: 'starter', formule: 'unique', total: 1 });
let L = lignesStripe().pop();
t('paiement Starter : lien Stripe, 280 €', r.s === 200 && r.d.url.startsWith('https://checkout.stripe.com') && L['line_items[0][price_data][unit_amount]'] === '28000' && L.mode === 'payment', JSON.stringify(r.d));
t('… facture automatique, client relié, métadonnées', L['invoice_creation[enabled]'] === 'true' && L['metadata[kreative_client]'] === cid && L.customer_email === 'ines@nova.fr' && L['customer_creation'] === 'always');
r = await api('/api/client/paiement', CK, 'POST', { pack: 'growth', formule: 'mensuel' }); L = lignesStripe().pop();
t('paiement Growth mensuel : abonnement à 420 €/mois', L.mode === 'subscription' && L['line_items[0][price_data][unit_amount]'] === '42000' && L['line_items[0][price_data][recurring][interval]'] === 'month' && L['subscription_data[metadata][pack]'] === 'growth');

// le configurateur Custom
r = await api('/api/client/paiement', CK, 'POST', { pack: 'custom', formule: 'unique', nb_creas: 47, options: ['ab_texte', 'express', 'ab_visuel', 'pirate'], total: 3 }); L = lignesStripe().pop();
t('Custom 47 créas → 45, A/B visuel + texte plafonnés à 45 au total, express 390 € : 2 860 €', r.d.total === 2860 && L['line_items[0][price_data][unit_amount]'] === '286000' && L['metadata[options]'] === 'express,ab_visuel:44,ab_texte:1' && L['metadata[nb_creas]'] === '45', JSON.stringify(r.d) + ' ' + L['metadata[options]']);
t('… nommé « Pack Custom », le contenu en description', L['line_items[0][price_data][product_data][name]'] === 'Pack Custom' && /^45 créatives • Livrés en 1:1, 4:5 et 9:16/.test(L['line_items[0][price_data][product_data][description]']), L['line_items[0][price_data][product_data][description]']);
r = await api('/api/client/paiement', CK, 'POST', { pack: 'growth', formule: 'unique', options: ['ab_texte', 'express'] }); L = lignesStripe().pop();
t('Growth + A/B texte + express : 490 + 12 × 15 + 190 = 860 €', r.d.total === 860 && L['line_items[0][price_data][unit_amount]'] === '86000' && /Livraison express/.test(L['line_items[0][price_data][product_data][description]']), JSON.stringify(r.d));
r = await api('/api/client/paiement', CK, 'POST', { pack: 'growth', formule: 'mensuel', options: ['ab_visuel'] }); L = lignesStripe().pop();
t('Growth mensuel + A/B visuel : 420 + 12 × 20 = 660 €/mois, abonnement', r.d.total === 660 && L.mode === 'subscription' && L['line_items[0][price_data][product_data][name]'] === 'Pack Growth' && /12 visuels statiques par mois/.test(L['line_items[0][price_data][product_data][description]']), JSON.stringify(r.d));
r = await api('/api/client/paiement', CK, 'POST', { pack: 'starter', formule: 'unique', integre: true }); L = lignesStripe().pop();
t('le paiement ouvre toujours la page Stripe (pas de paiement intégré)', r.s === 200 && r.d.url && !L.ui_mode && /\/client\/#\/merci$/.test(L.success_url), JSON.stringify(r.d) + ' ' + L.ui_mode);
r = await api('/api/client/moi', CK); t('le portail reçoit la clé publique et les options', r.d.stripe_public === 'pk_test_faux' && r.d.options.length === 3, JSON.stringify(r.d.options));
r = await api('/api/client/paiement', CK, 'POST', { pack: 'custom', formule: 'mensuel', nb_creas: 500, options: [] });
t('Custom plafonné à 100 créas, palier 29 €, −15 % en mensuel : 2 465 €', r.d.total === Math.round(100 * 29 * 0.85), JSON.stringify(r.d));
r = await api('/api/client/paiement?client=' + cid, A, 'POST', { pack: 'starter', formule: 'unique' });
t('l\'admin en aperçu ne peut pas payer à la place du client', r.s === 403, r.s);

// le webhook
t('webhook sans signature valide refusé', (await webhook({ type: 'checkout.session.completed', data: { object: {} } }, 'mauvais')) === 400);
const sess = { id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 28000, customer: 'cus_nova', invoice: 'in_1',
  customer_details: { email: 'ines@nova.fr', name: 'Inès Roy' }, metadata: { kreative_client: cid, pack: 'starter', formule: 'unique', nb_creas: '6', options: '' } };
t('facture reçue avant la commande', (await webhook({ type: 'invoice.paid', data: { object: { id: 'in_1', status: 'paid', number: 'KRV-0001', total: 28000, customer: 'cus_nova', customer_email: 'ines@nova.fr', created: 1, invoice_pdf: 'https://pay.stripe.com/x.pdf', status_transitions: { paid_at: 2 } } } })) === 200);
t('paiement réussi reçu', (await webhook({ type: 'checkout.session.completed', data: { object: sess } })) === 200);
await webhook({ type: 'checkout.session.completed', data: { object: sess } });
r = await api('/api/admin/clients/' + cid, A);
const k = r.d.commandes.find(x => x.stripe_session === 'cs_1');
t('une seule commande créée, confirmée, 280 €', r.d.commandes.filter(x => x.stripe_session === 'cs_1').length === 1 && k && k.statut === 'brief' && k.prix === 280 && k.etat === 'confirmee', JSON.stringify(r.d.commandes.map(x => [x.ref, x.statut, x.prix])));
t('la facture est rattachée à la commande et au client', r.d.factures.length === 1 && r.d.factures[0].commande_id === k.id && r.d.factures[0].statut === 'payee', JSON.stringify(r.d.factures));
r = await api('/api/client/moi', CK);
t('le client voit sa facture (sans données internes)', r.d.factures.length === 1 && r.d.factures[0].pdf && !('stripe_id' in r.d.factures[0]) && !('email' in r.d.factures[0]));
t('étapes : commande confirmée, brief à envoyer', JSON.stringify(r.d.commandes.find(x => x.id === k.id).etapes.map(e => e.fait)) === '[true,false,false,false,false,false]');

// abonnement puis renouvellement
const sAbo = { id: 'cs_2', mode: 'subscription', payment_status: 'paid', amount_total: 42000, customer: 'cus_nova', subscription: 'sub_1', invoice: 'in_2',
  customer_details: { email: 'ines@nova.fr' }, metadata: { kreative_client: cid, pack: 'growth', formule: 'mensuel', nb_creas: '12' } };
await webhook({ type: 'checkout.session.completed', data: { object: sAbo } });
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_2', status: 'paid', billing_reason: 'subscription_create', subscription: 'sub_1', total: 42000, customer: 'cus_nova', created: 3 } } });
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_3', status: 'paid', billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub_1', metadata: {} } }, total: 42000, customer: 'cus_nova', created: 4 } } });
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_3', status: 'paid', billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub_1', metadata: {} } }, total: 42000, customer: 'cus_nova', created: 4 } } });
r = await api('/api/admin/clients/' + cid, A);
const abo = r.d.commandes.filter(x => x.stripe_abo === 'sub_1');
t('abonnement : 1 commande au départ + 1 par mois payé (sans doublon)', abo.length === 2 && abo.every(x => x.formule === 'mensuel' && x.pack === 'growth' && x.statut === 'brief'), JSON.stringify(abo.map(x => [x.ref, x.stripe_facture])));
t('chaque facture mensuelle va sur sa commande', r.d.factures.filter(f => abo.some(x => x.id === f.commande_id)).length === 2, JSON.stringify(r.d.factures.map(f => [f.stripe_id, f.commande_id])));

// achat depuis le site (lien Stripe sans métadonnées) : l'espace se crée seul
fs.rmSync('emails.log', { force: true });
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_3', mode: 'payment', payment_status: 'paid', amount_total: 49000, customer: 'cus_new',
  customer_details: { email: 'Paul@Atelier.fr', name: 'Paul Martin', business_name: 'Atelier Martin' }, metadata: {} } } });
r = await api('/api/admin/clients', A); const neuf = r.d.find(x => x.email === 'paul@atelier.fr');
const mails = fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').map(JSON.parse) : [];
t('achat sur le site : espace client créé (Atelier Martin) + lien envoyé', neuf && neuf.marque === 'Atelier Martin' && neuf.nb_commandes === 1 && mails.some(m => m.corps.a === 'paul@atelier.fr'), JSON.stringify(neuf));

// achat sur la landing avec un lien de paiement (nom d'entreprise demandé par Stripe dans collected_information)
fs.rmSync('emails.log', { force: true });
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_land', mode: 'payment', payment_status: 'paid', amount_total: 89000, customer: 'cus_land', payment_link: 'plink_1UQg7tBaFgfyJZxj4JXOkExz',
  customer_details: { email: 'lea@solen.fr', name: 'Léa Bernard' }, collected_information: { business_name: 'Solen Studio' }, metadata: {} } } });
r = await api('/api/admin/clients', A); const land = r.d.find(x => x.email === 'lea@solen.fr');
const mails2 = fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').map(JSON.parse) : [];
const m2 = (mails2.find(m => m.corps.a === 'lea@solen.fr') || {}).corps || {};
t('landing : espace « Solen Studio » créé, pack Scale, email de bienvenue avec son lien', land && land.marque === 'Solen Studio' && land.contact === 'Léa Bernard' && /\/acces\//.test(m2.lien || '') && /Ouvrir mon espace/.test(m2.html || '') && /Bonjour Léa/.test(m2.html || ''), JSON.stringify([land && land.marque, m2.sujet]));
r = await api('/api/admin/clients/' + neuf.id, A);
t('… pack Growth déduit du montant (490 €)', r.d.commandes[0].pack === 'growth' && r.d.commandes[0].prix === 490);

// lien de paiement fixe du portail : le client est reconnu par client_reference_id, le pack par le lien (même avec un code promo)
r = await api('/api/client/moi', CK);
t('le portail reçoit les 6 liens Stripe', r.d.liens.growth.mensuel === 'https://buy.stripe.com/14A6oG3RSc2TdLO2Gd6c00z' && r.d.liens.starter.unique.startsWith('https://buy.stripe.com/'));
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_4', mode: 'subscription', payment_status: 'paid', amount_total: 37800, customer: 'cus_autre', subscription: 'sub_9',
  payment_link: 'plink_1UQgDlBaFgfyJZxjTCHsmfxo', client_reference_id: cid, customer_details: { email: 'compta@nova-holding.fr' }, metadata: {} } } });
r = await api('/api/admin/clients/' + cid, A); const viaLien = r.d.commandes.find(x => x.stripe_session === 'cs_4');
t('paiement par lien avec un autre email et un code promo : bon client, Growth mensuel', viaLien && viaLien.pack === 'growth' && viaLien.formule === 'mensuel' && viaLien.prix === 378,
  JSON.stringify(viaLien && [viaLien.pack, viaLien.formule, viaLien.prix]));
r = await api('/api/admin/clients', A); t('… et pas de faux nouveau client créé', !r.d.some(x => x.email === 'compta@nova-holding.fr'));

// le client : profil, validation, avis
r = await api('/api/client/moi', CK, 'PATCH', { contact: 'Inès Roy-Martin', telephone: '0611', site: 'https://nova.fr', jeton: 'pirate', statut: 'bloque' });
const moi = (await api('/api/client/moi', CK)).d.client;
t('profil modifiable par le client (seulement ses infos)', r.s === 200 && moi.contact === 'Inès Roy-Martin' && moi.telephone === '0611' && (await api('/api/client/moi', CK)).s === 200);
r = await api('/api/client/moi', CK, 'PATCH', { email: 'paul@atelier.fr' }); t('email déjà pris refusé', r.s === 409, r.s);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
r = await api('/api/client/moi', CK, 'PATCH', { photo: png }); let pm = (await api('/api/client/moi', CK)).d.client;
let img = await get('/api/client/photo', { headers: { Cookie: CK } });
t('photo de profil enregistrée et servie en image', r.s === 200 && pm.photo_le > 0 && !('photo' in pm) && img.status === 200 && img.headers.get('content-type') === 'image/png');
img = await get('/api/admin/clients/' + cid + '/photo', { headers: { Cookie: A } }); t('l\'admin voit la photo', img.status === 200);
r = await api('/api/admin/clients', A); t('la liste admin n\'embarque pas les images', !JSON.stringify(r.d).includes('base64'));
r = await api('/api/client/moi', CK, 'PATCH', { photo: 'data:text/html;base64,PHNjcmlwdD4=' }); t('fichier qui n\'est pas une image refusé', r.s === 400, r.s);
r = await api('/api/client/moi', CK, 'PATCH', { photo: '' }); img = await get('/api/client/photo', { headers: { Cookie: CK } }); t('photo retirée', r.s === 200 && img.status === 404);
r = await api('/api/client/commandes/' + k.id + '/valider', CK, 'POST'); t('impossible de valider avant la livraison', r.s === 409, r.s);
await api('/api/admin/commandes/' + k.id, A, 'PATCH', { dossier: 'TURNLY_10_bc5e' });
r = await api('/api/client/moi', CK); let kk = r.d.commandes.find(x => x.id === k.id);
t('dossier relié → brief envoyé, en production', kk.etat === 'production' && kk.etapes[1].fait && !kk.etapes[3].fait, kk.etat + JSON.stringify(kk.etapes.map(e => e.fait)));
await api('/api/admin/commandes/' + k.id, A, 'PATCH', { statut: 'livre' });
r = await api('/api/client/commandes/' + k.id + '/valider', CK, 'POST'); t('le client valide après la livraison', r.s === 200, r.s);
r = await api('/api/client/moi', CK); kk = r.d.commandes.find(x => x.id === k.id);
t('validé : 5 étapes sur 5, 100 %, l\'avis reste à donner', kk.etat === 'valide' && kk.progression === 100 && kk.en_cours === 'avis', kk.etat + ' ' + kk.progression + ' ' + kk.en_cours);
r = await api('/api/client/commandes/' + k.id + '/avis', CK, 'POST', { action: 'ecrit' });
kk = (await api('/api/client/moi', CK)).d.commandes.find(x => x.id === k.id);
t('avis Trustpilot noté', r.s === 200 && kk.avis_le && kk.en_cours === null);

// admin : les packs fixes ne se modifient pas
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'scale', formule: 'unique', nb_creas: 3, prix: 10 });
let c2 = (await api('/api/admin/clients/' + cid, A)).d.commandes.find(x => x.id === r.d.id);
t('admin : Scale reste à 24 créas et 890 € même si on envoie autre chose', c2.nb_creas === 24 && c2.prix === 890, c2.nb_creas + ' ' + c2.prix);
r = await api('/api/admin/commandes', A, 'POST', { client_id: cid, pack: 'custom', formule: 'unique', nb_creas: 40, prix: 1350 });
c2 = (await api('/api/admin/clients/' + cid, A)).d.commandes.find(x => x.id === r.d.id);
t('admin : Custom se règle à la main', c2.nb_creas === 40 && c2.prix === 1350);
r = await api('/api/admin/factures', A); t('liste des factures admin', r.s === 200 && r.d.factures.length === 3 && r.d.stripe === true, r.s);

// ---- la landing : un lien de paiement pour chaque pack, Custom compris ----
const lignesBrutes = () => fs.existsSync('stripe.log') ? fs.readFileSync('stripe.log', 'utf8').trim().split('\n').filter(Boolean) : [];
const avantS = lignesBrutes().length;
r = await get('/payer/custom?creas=45&options=express,ab_visuel', { headers: { Referer: 'https://kreativeads.fr/tarifs' } });
const LS = Object.fromEntries(new URLSearchParams(lignesBrutes().slice(avantS).pop() || ''));
t('lien Custom de la landing → page Stripe (303)', r.status === 303 && /checkout\.stripe\.com/.test(r.headers.get('location') || ''), r.status);
t('… au bon montant : 45 × 35 + 45 × 20 + 390 = 2 865 €', LS['line_items[0][price_data][unit_amount]'] === '286500', LS['line_items[0][price_data][unit_amount]']);
t('… retour sur kreativeads.fr/merci-custom, annulation vers la landing', LS.success_url === 'https://kreativeads.fr/merci-custom?session_id={CHECKOUT_SESSION_ID}' && LS.cancel_url === 'https://kreativeads.fr/tarifs', LS.success_url + ' | ' + LS.cancel_url);
t('… paiement unique, compte créé au paiement', LS.mode === 'payment' && LS.customer_creation === 'always' && LS['metadata[source]'] === 'landing' && !LS.client_reference_id, JSON.stringify(LS).slice(0, 200));
r = await get('/payer/starter?options=express'); const LS2 = Object.fromEntries(new URLSearchParams(lignesBrutes().pop() || ''));
t('lien Starter + express : 280 + 90 = 370 €', r.status === 303 && LS2['line_items[0][price_data][unit_amount]'] === '37000', LS2['line_items[0][price_data][unit_amount]']);
r = await get('/payer/inconnu'); t('pack inconnu : pas de paiement', r.status !== 303, r.status);
for (const pk of ['', '-starter', '-growth', '-scale', '-custom']) { r = await get('/merci' + pk); t('page /merci' + pk + ' publique', r.status === 200 && /Merci pour votre commande/.test(await r.text()), r.status); }
// achat Custom sur la landing → compte + commande avec ses options, numéro = numéro de facture Stripe
const sessL = { id: 'cs_landing_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 286500, customer: 'cus_landing_custom', invoice: 'in_land',
  customer_details: { email: 'lea@landing.fr', name: 'Léa Land', business_name: 'Landing Co' }, metadata: { pack: 'custom', formule: 'unique', nb_creas: '45', options: 'express,ab_visuel', total: '2865', source: 'landing' } };
await webhook({ type: 'checkout.session.completed', data: { object: sessL } });
await webhook({ type: 'invoice.paid', data: { object: { id: 'in_land', status: 'paid', number: 'IEVKJLPP-0024', total: 286500, customer: 'cus_landing_custom', customer_email: 'lea@landing.fr', created: 3, status_transitions: { paid_at: 3 } } } });
const cls = (await api('/api/admin/clients', A)).d; const cland = cls.find(c => c.email === 'lea@landing.fr');
const kland = cland && (await api('/api/admin/clients/' + cland.id, A)).d.commandes[0];
t('achat Custom de la landing : client créé', !!cland && cland.marque === 'Landing Co', String(JSON.stringify(cland)).slice(0, 120));
t('… commande Custom 45 créas avec ses options', kland && kland.pack === 'custom' && kland.nb_creas === 45 && /express/.test(kland.options || ''), JSON.stringify(kland).slice(0, 200));
t('… son numéro = le numéro de la facture Stripe', kland && kland.ref === 'IEVKJLPP-0024', kland && kland.ref);
const fl = (await api('/api/admin/factures', A)).d.factures.find(f => f.stripe_id === 'in_land' || f.numero === 'IEVKJLPP-0024');
t('… la facture porte le même numéro et la même commande', fl && fl.numero === kland.ref && fl.commande_id === kland.id, JSON.stringify(fl).slice(0, 160));
// le brief : questions et réponses gardées pour le client
r = await get('/api/n8n/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kreative-Cle': sec.CLE }, body: JSON.stringify({ dossier: 'LANDINGCO_10_aaaa', commande: kland.ref, client: cland.id,
  questions: [{ name: 'Quel est le nom de votre entreprise ?', type: 'ShortAnswer', value: 'Landing Co' }, { name: 'Vos offres', type: 'LongAnswer', value: 'Offre 1\nOffre 2' },
    { name: 'Votre logo', type: 'FileUpload', value: [{ url: 'https://fillout.com/f/logo.png', filename: 'logo.png' }] }, { name: 'Vide', type: 'ShortAnswer', value: '' }, { name: 'Cible', type: 'MultipleChoice', value: ['Femmes', '25-35 ans'] }] }) });
const brief = await r.json();
t('brief relié à la commande (par son numéro de facture)', brief.ok === true, JSON.stringify(brief));
const kb = (await api('/api/admin/clients/' + cland.id, A)).d.commandes[0], bj = JSON.parse(kb.brief_json || '[]');
t('le brief est gardé : 4 réponses, fichiers et choix multiples', bj.length === 4 && bj[2].fichiers[0].nom === 'logo.png' && bj[3].texte === 'Femmes, 25-35 ans' && bj[1].texte === 'Offre 1\nOffre 2', kb.brief_json);
// les A/B tests en quantité : de 1 au nombre de créas
r = await get('/payer/growth?options=ab_visuel:5,ab_texte:99');
const LQ = Object.fromEntries(new URLSearchParams(lignesBrutes().pop() || ''));
t('A/B visuel × 5, A/B texte plafonné à 7 (12 au total) : 490 + 100 + 105 = 695 €', LQ['line_items[0][price_data][unit_amount]'] === '69500' && LQ['metadata[options]'] === 'ab_visuel:5,ab_texte:7', LQ['metadata[options]'] + ' ' + LQ['line_items[0][price_data][unit_amount]']);
t('… écrit « A/B test visuel × 5 » sur la page Stripe', /A\/B test visuel × 5/.test(LQ['line_items[0][price_data][product_data][description]']), LQ['line_items[0][price_data][product_data][description]']);
r = await get('/commander/custom'); t('panier public de la landing (style du site)', r.status === 200 && /kc-recap/.test(await r.text()), r.status);
r = await get('/api/offres'); const off = await r.json(); t('offres publiques (prix express par pack)', off.options.find(o => o.id === 'express').par_pack.growth === 190, JSON.stringify(off).slice(0, 80));
// les questions du paiement du site (une seule fois) : marque, site, téléphone
t('site : nom de l\'entreprise et nom (champs Stripe), pas d\'adresse ni de téléphone', LS['name_collection[business][enabled]'] === 'true' && LS['name_collection[business][optional]'] === 'false' && LS['name_collection[individual][enabled]'] === 'true' && !LS['custom_fields[0][key]'] && !LS['phone_number_collection[enabled]'] && LS.billing_address_collection === 'auto' && !LS['tax_id_collection[enabled]'], JSON.stringify(LS).slice(0, 400));
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_attar', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 28000, customer: 'cus_attar',
  customer_details: { email: 'contact@attar.fr', name: 'Attar Studio', business_name: 'Attar Studio', individual_name: 'Ayoub Attar' }, collected_information: { business_name: 'Attar Studio', individual_name: 'Ayoub Attar' },
  metadata: { pack: 'starter', formule: 'unique', nb_creas: '6', options: '', total: '280', source: 'landing' } } } });
const ca = (await api('/api/admin/clients', A)).d.find(c => c.email === 'contact@attar.fr');
const ka = ca && (await api('/api/admin/clients/' + ca.id, A)).d.commandes[0];
t('Attar Studio paie le Starter sur le site : espace « Attar Studio », contact Ayoub Attar, commande Starter', ca && ca.marque === 'Attar Studio' && ca.contact === 'Ayoub Attar' && ka && ka.pack === 'starter' && ka.prix === 280, JSON.stringify(ca).slice(0, 160));
t('… et son email d\'accès part à contact@attar.fr', (await new Promise(z => setTimeout(z, 400)), fs.existsSync('emails.log') && /contact@attar\.fr/.test(fs.readFileSync('emails.log', 'utf8'))), 'emails');
const portail = lignesBrutes().map(l => Object.fromEntries(new URLSearchParams(l))).filter(x => x['metadata[kreative_client]']);
t('espace client : rien à redemander', portail.length > 0 && portail.every(x => !x['custom_fields[0][key]'] && !x['phone_number_collection[enabled]']), portail.length);
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_q1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 49000, customer: 'cus_q1',
  customer_details: { email: 'nina@lune.fr', name: 'Nina Roux', phone: '+33611223344' }, custom_fields: [{ key: 'marque', label: { custom: 'Nom de votre marque' }, text: { value: 'Maison Lune' } }, { key: 'site', label: { custom: 'Site web ou Instagram' }, text: { value: '@maisonlune' } }],
  metadata: { pack: 'growth', formule: 'unique', nb_creas: '12', options: '', total: '490', source: 'landing' } } } });
let cq = (await api('/api/admin/clients', A)).d.find(c => c.email === 'nina@lune.fr');
t('réponses rangées dans la fiche : marque, contact, téléphone, site', cq && cq.marque === 'Maison Lune' && cq.contact === 'Nina Roux' && cq.telephone === '+33611223344' && cq.site === '@maisonlune', JSON.stringify(cq).slice(0, 200));
await api('/api/admin/clients/' + cq.id, A, 'PATCH', { telephone: '', site: '' });
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_q2', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 28000, customer: 'cus_q1',
  customer_details: { email: 'nina@lune.fr', name: 'Nina Roux', phone: '+33699999999' }, custom_fields: [{ key: 'marque', text: { value: 'Autre nom' } }, { key: 'site', text: { value: 'lune.fr' } }],
  metadata: { pack: 'starter', formule: 'unique', nb_creas: '6', options: '', total: '280', source: 'landing' } } } });
cq = (await api('/api/admin/clients', A)).d.find(c => c.email === 'nina@lune.fr');
t('client connu : même fiche, on complète ce qui manque sans renommer', cq && cq.marque === 'Maison Lune' && cq.telephone === '+33699999999' && cq.site === 'lune.fr' && cq.nb_commandes === 2, JSON.stringify(cq).slice(0, 200));
// une question ajoutée à la main sur un ancien lien Stripe (clé générée par Stripe) est reconnue aussi
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_q3', object: 'checkout.session', mode: 'payment', payment_status: 'paid', amount_total: 89000, customer: 'cus_q3', payment_link: 'plink_1UQg7tBaFgfyJZxj4JXOkExz',
  customer_details: { email: 'max@cap.fr', name: 'Max Cap' }, custom_fields: [{ key: 'nomdevotremarque', label: { type: 'custom', custom: 'Nom de votre marque' }, text: { value: 'Cap Studio' } }], metadata: {} } } });
cq = (await api('/api/admin/clients', A)).d.find(c => c.email === 'max@cap.fr');
t('ancien lien Stripe avec la question : marque reconnue', cq && cq.marque === 'Cap Studio', JSON.stringify(cq).slice(0, 160));
// depuis le panier affiché dans Framer : chaque pack (même avec options) revient sur sa page merci, l'annulation sur sa page panier
for (const [pk, q] of [['starter', 'options=express,ab_visuel:2'], ['growth', ''], ['scale', 'options=ab_texte:3'], ['custom', 'creas=55']]) {
  const avant = lignesBrutes().length;
  r = await get('/payer/' + pk + (q ? '?' + q : ''), { headers: { Referer: B + '/commander/' + pk } });
  const L = Object.fromEntries(new URLSearchParams(lignesBrutes().slice(avant).pop() || ''));
  t('pack ' + pk + (q ? ' (' + q + ')' : '') + ' : merci-' + pk + ', annulation sur kreativeads.fr/commander/' + pk + ', facture détaillée',
    r.status === 303 && L.success_url === 'https://kreativeads.fr/merci-' + pk + '?session_id={CHECKOUT_SESSION_ID}' && L.cancel_url === 'https://kreativeads.fr/commander/' + pk && L['invoice_creation[enabled]'] === 'true' && /créatives|visuels/.test(L['invoice_creation[invoice_data][description]'] || ''), L.success_url + ' | ' + L.cancel_url);
}
// espace client, client Stripe déjà connu (n° de TVA demandé) : Stripe exige customer_update[name]=auto
r = await api('/api/client/paiement', CK, 'POST', { pack: 'custom', formule: 'unique', nb_creas: 55 });   // ce client a déjà payé : il est connu de Stripe
const avecClient = lignesBrutes().map(l => Object.fromEntries(new URLSearchParams(l))).filter(x => x.customer);
t('client Stripe connu : nom et adresse mis à jour par Stripe (sinon refus « Tax ID collection requires… »)', avecClient.length > 0 && avecClient.every(x => x['customer_update[name]'] === 'auto' && x['customer_update[address]'] === 'auto'), avecClient.length);
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

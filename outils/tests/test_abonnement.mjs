// Résilier un abonnement depuis l'espace client : engagement de 3 mois, résiliable une fois le 3e mois débité,
// effet à la fin du mois en cours (Stripe cancel_at_period_end). Et le même verrou côté Stripe. Usage : node test_abonnement.mjs config-test.json
import fs from 'node:fs'; import crypto from 'node:crypto';
const sec = JSON.parse(fs.readFileSync(process.argv[2])); const B = 'http://127.0.0.1:8787';
let ok = 0, ko = 0; const t = (nom, c, info = '') => { c ? ok++ : ko++; console.log((c ? '✅ ' : '❌ ') + nom + (c ? '' : '  → ' + info)); };
const get = (p, o = {}) => fetch(B + p, { redirect: 'manual', ...o });
const cookie = r => (r.headers.get('set-cookie') || '').split(';')[0];
const A = cookie(await get('/_connexion', { method: 'POST', body: new URLSearchParams({ mdp: sec.ACCES.dario, suite: '/' }) }));
const api = async (p, ck, methode, corps) => { const r = await get(p, { method: methode || 'GET', headers: { Cookie: ck, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined }); let d = null; try { d = await r.json(); } catch (e) {} return { s: r.status, d }; };
const webhook = async ev => {
  const corps = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test_faux').update(ts + '.' + corps).digest('hex');
  return (await get('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=' + ts + ',v1=' + sig, 'Content-Type': 'application/json' }, body: corps })).status;
};
const appelsAbo = () => fs.existsSync('stripe_abo.log') ? fs.readFileSync('stripe_abo.log', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
fs.rmSync('stripe_abo.log', { force: true });
const facture = (id, n, raison) => ({ type: 'invoice.paid', data: { object: { id, status: 'paid', number: 'KRV-00' + n, billing_reason: raison,
  parent: { subscription_details: { subscription: 'sub_abo', metadata: {} } }, total: 42000, customer: 'cus_abo', created: n, status_transitions: { paid_at: n } } } });

// un client abonné Growth : 1er mois payé
let r = await api('/api/admin/clients', A, 'POST', { marque: 'Lumen', contact: 'Sara Petit', email: 'sara@lumen.fr' });
const cid = r.d.id; const CK = cookie(await get(r.d.lien.replace(B, '')));
r = await api('/api/admin/clients', A, 'POST', { marque: 'Autre', contact: 'Paul', email: 'paul@autre.fr' });
const CK2 = cookie(await get(r.d.lien.replace(B, '')));
r = await api('/api/client/moi', CK);
t('sans abonnement : liste vide', Array.isArray(r.d.abonnements) && r.d.abonnements.length === 0, JSON.stringify(r.d.abonnements));
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_abo', mode: 'subscription', payment_status: 'paid', amount_total: 42000, customer: 'cus_abo',
  subscription: 'sub_abo', invoice: 'in_a1', customer_details: { email: 'sara@lumen.fr' }, metadata: { kreative_client: cid, pack: 'growth', formule: 'mensuel', nb_creas: '12' } } } });
await webhook(facture('in_a1', 1, 'subscription_create'));
r = await api('/api/client/moi', CK); let ab = r.d.abonnements[0];
t('1er mois : abonnement Growth visible, 1 mois payé, pas encore résiliable', r.d.abonnements.length === 1 && ab.id === 'sub_abo' && ab.nom === 'Growth' && ab.prix === 420 && ab.mois_payes === 1 && !ab.resiliable && ab.statut === 'actif', JSON.stringify(ab));
const d1 = new Date(ab.debut), d3 = new Date(ab.resiliable_des);
t('… résiliable dès le paiement du 3e mois (début + 2 mois)', (d3.getUTCFullYear() * 12 + d3.getUTCMonth()) - (d1.getUTCFullYear() * 12 + d1.getUTCMonth()) === 2, d1.toISOString() + ' ' + d3.toISOString());
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
t('pendant l\'engagement : pas d\'offre non plus', (await api('/api/client/abonnement/offre?abo=sub_abo', CK)).d.offre === null);
t('pendant l\'engagement : résiliation refusée, avec la date', r.s === 409 && /Engagement de 3 mois en cours : vous pourrez résilier à partir du \d+ \S+ \d{4}/.test(r.d.erreur) && !appelsAbo().length, r.s + ' ' + JSON.stringify(r.d));

// 2e et 3e mois payés : à chaque nouveau mois, le client est prévenu que son brief est à remplir
const emailsAvant = fs.existsSync('emails.log') ? fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).length : 0;
t('1er mois : pas de notification de brief du mois (le brief complet passe par l\'email d\'accès)', !/^Votre brief/.test((await api('/api/client/notifications/derniere', CK)).d.titre || ''));
await webhook(facture('in_a2', 2, 'subscription_cycle'));
const nb = (await api('/api/client/notifications/derniere', CK)).d;
t('nouveau mois payé : notification « Votre brief de … » vers Mon brief', /^Votre brief (de |d')(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)$/.test(nb.titre) && nb.url === '/client/#/brief' && nb.texte === 'Faites-nous part de vos retours pour lancer la production de ce nouveau mois.', JSON.stringify(nb));
const mails = fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).slice(emailsAvant).map(l => JSON.parse(l).corps);
t('… et un email « Remplir mon brief » avec son lien d\'accès', mails.length === 1 && mails[0].a === 'sara@lumen.fr' && /^Lumen · Votre brief (de |d')/.test(mails[0].sujet) && /Remplir mon brief/.test(mails[0].html) && /Dites-nous-en davantage/.test(mails[0].html) && /\/acces\//.test(mails[0].html), JSON.stringify(mails.map(m => m.sujet)));
await webhook(facture('in_a2', 2, 'subscription_cycle'));
t('… une seule fois, même si Stripe renvoie la facture', fs.readFileSync('emails.log', 'utf8').trim().split('\n').filter(Boolean).length === emailsAvant + 1);
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('2e mois : toujours pas résiliable', ab.mois_payes === 2 && !ab.resiliable, JSON.stringify(ab));
await webhook(facture('in_a3', 3, 'subscription_cycle'));
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('3e mois débité : résiliable (s\'arrête à la fin de ce mois, pas de 4e prélèvement)', r.d.abonnements.length === 1 && ab.mois_payes === 3 && ab.resiliable, JSON.stringify(ab));

// sécurité
r = await api('/api/client/abonnement/resilier?client=' + cid, A, 'POST', { abo: 'sub_abo' });
t('l\'admin en aperçu ne peut pas résilier à la place du client', r.s === 403 && !appelsAbo().length, r.s);
r = await api('/api/client/abonnement/resilier', CK2, 'POST', { abo: 'sub_abo' });
t('un autre client ne peut pas résilier cet abonnement', r.s === 404 && !appelsAbo().length, r.s);
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_inexistant' });
t('abonnement inconnu : 404', r.s === 404, r.s);

// avant de résilier : l'offre pour rester (coupon Stripe FIDELITE), une seule fois
r = await api('/api/client/abonnement/offre?abo=sub_abo', CK);
t('offre pour rester : lue dans le coupon Stripe FIDELITE (-20 % une fois)', r.s === 200 && r.d.offre && r.d.offre.texte === '-20 % sur votre prochain mois', JSON.stringify(r.d));
r = await api('/api/client/abonnement/offre?abo=sub_abo', CK2);
t('… pas pour un autre client', r.s === 404, r.s);
r = await api('/api/client/abonnement/garder?client=' + cid, A, 'POST', { abo: 'sub_abo' });
t('… l\'admin en aperçu ne peut pas l\'accepter', r.s === 403 && !appelsAbo().length, r.s);
r = await api('/api/client/abonnement/garder', CK, 'POST', { abo: 'sub_abo' });
let L = appelsAbo();
t('« Garder mon abonnement » avec l\'offre : coupon posé sur l\'abonnement Stripe, pas de résiliation', r.s === 200 && L.length === 1 && L[0]['discounts[0][coupon]'] === 'FIDELITE' && !('cancel_at_period_end' in L[0]), r.s + ' ' + JSON.stringify(L));
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('… toujours actif, offre notée (et dans l\'activité)', ab.statut === 'actif' && ab.offre_le && r.d.activite.some(a => /a gardé son abonnement Pack Growth avec l'offre -20 % sur votre prochain mois/.test(a.texte)), JSON.stringify(ab));
r = await api('/api/client/abonnement/offre?abo=sub_abo', CK);
t('… une seule fois : plus d\'offre ensuite', r.s === 200 && r.d.offre === null, JSON.stringify(r.d));
r = await api('/api/client/abonnement/garder', CK, 'POST', { abo: 'sub_abo' });
t('… et impossible de la reprendre', r.s === 409 && appelsAbo().length === 1, r.s);
fs.rmSync('stripe_abo.log', { force: true });

// la résiliation
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
L = appelsAbo();
t('résiliation : Stripe arrête l\'abonnement à la fin du mois payé (cancel_at_period_end), pas tout de suite', r.s === 200 && r.d.statut === 'resiliation' && L.length === 1 && L[0].id === 'sub_abo' && L[0].cancel_at_period_end === 'true' && Object.keys(L[0]).length === 2, r.s + ' ' + JSON.stringify(r.d) + ' ' + JSON.stringify(L));
t('… date de fin = fin de la période déjà payée (dans ~20 jours)', Math.abs(r.d.fin_le - (Date.now() + 20 * 86400000)) < 120000, r.d.fin_le);
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('… l\'espace client affiche la résiliation et sa date', ab.statut === 'resiliation' && ab.fin_le && ab.resilie_le && !ab.resiliable, JSON.stringify(ab));
t('… notée dans l\'activité', r.d.activite.some(a => a.type === 'abonnement' && /résilié : il s'arrête le/.test(a.texte)), JSON.stringify(r.d.activite.slice(0, 3)));
r = await api('/api/admin/clients/' + cid, A);
t('… l\'admin la voit sur la fiche client', r.d.abonnements && r.d.abonnements[0].statut === 'resiliation' && r.d.activite.some(a => a.type === 'abonnement'), JSON.stringify(r.d.abonnements));
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
t('… pas de double résiliation', r.s === 409 && /déjà enregistrée/.test(r.d.erreur) && appelsAbo().length === 1, r.s);
// Stripe confirme par webhook : pas de doublon dans l'activité
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_abo', status: 'active', cancel_at_period_end: true, cancel_at: Math.floor(Date.now() / 1000) + 20 * 86400 } } });
r = await api('/api/client/moi', CK);
t('confirmation de Stripe : pas de ligne en double', r.d.activite.filter(a => a.type === 'abonnement' && /résilié/.test(a.texte)).length === 1, JSON.stringify(r.d.activite));

// changer d'avis
r = await api('/api/client/abonnement/reprendre', CK, 'POST', { abo: 'sub_abo' });
L = appelsAbo();
t('garder son abonnement : Stripe annule la résiliation', r.s === 200 && r.d.statut === 'actif' && L.length === 2 && L[1].cancel_at_period_end === 'false', r.s + ' ' + JSON.stringify(L));
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('… de nouveau actif et résiliable', ab.statut === 'actif' && ab.resiliable && !ab.fin_le && !ab.resilie_le, JSON.stringify(ab));
r = await api('/api/client/abonnement/reprendre', CK, 'POST', { abo: 'sub_abo' });
t('… « garder » sans résiliation en cours : refusé', r.s === 409, r.s);

// résilié depuis le tableau de bord Stripe, puis terminé
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_abo', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1893456000 }] } } } });
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('résilié dans Stripe : le portail suit (fin = fin de période)', ab.statut === 'resiliation' && ab.fin_le === 1893456000000 && r.d.activite.some(a => /Abonnement résilié : il s'arrête le/.test(a.texte)), JSON.stringify(ab));
await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_abo', status: 'canceled', ended_at: 1893456000, canceled_at: 1893000000 } } });
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('fin de l\'abonnement : « terminé », plus résiliable', ab.statut === 'termine' && ab.fin_le === 1893456000000 && !ab.resiliable && r.d.activite.some(a => /Abonnement terminé le/.test(a.texte)), JSON.stringify(ab));
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
t('… résilier un abonnement terminé : refusé', r.s === 409 && /déjà terminé/.test(r.d.erreur), r.s);
t('webhook d\'un abonnement inconnu du portail : ignoré sans erreur', (await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_ailleurs', status: 'canceled' } } })) === 200);

// le verrou côté Stripe : une résiliation programmée pendant l'engagement (tableau de bord Stripe…) est repoussée à la fin du 3e mois
const moisStripe = (sec, n) => { const d = new Date(sec * 1000), j = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(j, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return Math.floor(d.getTime() / 1000); };
r = await api('/api/admin/clients', A, 'POST', { marque: 'Verrou', contact: 'Tom', email: 'tom@verrou.fr' });
const cidV = r.d.id, CKV = cookie(await get(r.d.lien.replace(B, '')));
await webhook({ type: 'checkout.session.completed', data: { object: { id: 'cs_v', mode: 'subscription', payment_status: 'paid', amount_total: 24000, customer: 'cus_v',
  subscription: 'sub_v', customer_details: { email: 'tom@verrou.fr' }, metadata: { kreative_client: cidV, pack: 'starter', formule: 'mensuel', nb_creas: '6' } } } });
const ancre = Math.floor(Date.UTC(2026, 10, 30, 10) / 1000), mini = moisStripe(ancre, 3);
t('fin minimale = ancre + 3 mois, comme Stripe (30 novembre → 28 février)', new Date(mini * 1000).toISOString() === '2027-02-28T10:00:00.000Z', new Date(mini * 1000).toISOString());
let n0 = appelsAbo().length;
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_v', status: 'active', billing_cycle_anchor: ancre, cancel_at_period_end: true, cancel_at: ancre + 30 * 86400,
  items: { data: [{ current_period_end: ancre + 30 * 86400 }] } } } });
L = appelsAbo().slice(n0);
t('résiliation au 1er mois dans Stripe : repoussée à la fin du 3e mois, sans prorata', L.length === 2 && L[0].cancel_at_period_end === 'false' && L[1].cancel_at === String(mini) && L[1].proration_behavior === 'none', JSON.stringify(L));
r = await api('/api/client/moi', CKV); ab = r.d.abonnements[0];
t('… le portail affiche la fin repoussée, une seule ligne d\'activité', ab.statut === 'resiliation' && ab.fin_le === mini * 1000 && r.d.activite.filter(a => a.type === 'abonnement').length === 1 && /repoussée au 28 février 2027/.test(r.d.activite[0].texte), JSON.stringify([ab, r.d.activite]));
n0 = appelsAbo().length;
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_v', status: 'active', billing_cycle_anchor: ancre, cancel_at_period_end: false, cancel_at: mini } } });
t('… Stripe confirme la nouvelle date : rien de plus (pas de boucle)', appelsAbo().length === n0 && (await api('/api/client/moi', CKV)).d.activite.filter(a => a.type === 'abonnement').length === 1);
await webhook({ type: 'customer.subscription.updated', created: 1000, data: { object: { id: 'sub_v', status: 'active', billing_cycle_anchor: ancre, cancel_at_period_end: false, cancel_at: null } } });
t('un vieil événement arrivé en retard est ignoré', (await api('/api/client/moi', CKV)).d.abonnements[0].statut === 'resiliation');
r = await api('/api/client/abonnement/reprendre', CKV, 'POST', { abo: 'sub_v' });
L = appelsAbo().slice(n0);
t('« Garder mon abonnement » efface aussi une fin programmée par date', r.s === 200 && r.d.statut === 'actif' && L.length === 2 && L[1].cancel_at === '', r.s + ' ' + JSON.stringify(L));
n0 = appelsAbo().length;
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_v', status: 'active', billing_cycle_anchor: ancre, cancel_at_period_end: false, cancel_at: ancre + 60 * 86400 } } });
L = appelsAbo().slice(n0);
t('fin programmée par date au 2e mois : repoussée elle aussi', L.length === 1 && L[0].cancel_at === String(mini), JSON.stringify(L));
n0 = appelsAbo().length;
await webhook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_v', status: 'active', billing_cycle_anchor: ancre, cancel_at_period_end: false, cancel_at: moisStripe(ancre, 4) } } });
t('fin après le 3e mois : laissée telle quelle', appelsAbo().length === n0);
await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_v', status: 'canceled', billing_cycle_anchor: ancre, ended_at: ancre + 40 * 86400 } } });
t('annulation immédiate faite par Kreative dans Stripe : respectée', appelsAbo().length === n0 && (await api('/api/client/moi', CKV)).d.abonnements[0].statut === 'termine');

// la page de paiement Stripe affiche l'engagement (abonnement seulement)
const lignes = () => fs.readFileSync('stripe.log', 'utf8').trim().split('\n').map(l => Object.fromEntries(new URLSearchParams(l)));
await api('/api/client/paiement', CKV, 'POST', { pack: 'scale', formule: 'mensuel' }); let P = lignes().pop();
t('paiement mensuel : engagement écrit au-dessus du bouton Stripe, et noté sur l\'abonnement', /engagement de 3 mois\. Une fois le 3e mois payé, résiliable depuis votre espace client/.test(P['custom_text[submit][message]'] || '') && P['subscription_data[metadata][engagement_mois]'] === '3', JSON.stringify(P));
await api('/api/client/paiement', CKV, 'POST', { pack: 'scale', formule: 'unique' }); P = lignes().pop();
t('paiement unique : pas de texte d\'engagement', !P['custom_text[submit][message]'] && P.mode === 'payment');
const rp = await get('/payer/growth?formule=mensuel', { headers: { Referer: B + '/commander/growth' } }); P = lignes().pop();
t('depuis le site aussi (Growth mensuel)', rp.status === 303 && /engagement de 3 mois/.test(P['custom_text[submit][message]'] || ''), rp.status);

// une commande mensuelle créée à la main dans l'admin (sans Stripe) n'a pas de bouton
r = await api('/api/admin/clients', A, 'POST', { marque: 'Manuel', contact: 'Léa', email: 'lea@manuel.fr' });
const cid3 = r.d.id, CK3 = cookie(await get(r.d.lien.replace(B, '')));
await api('/api/admin/commandes', A, 'POST', { client_id: cid3, pack: 'growth', formule: 'mensuel' });
r = await api('/api/client/moi', CK3);
t('abonnement créé à la main, sans Stripe : pas de résiliation en ligne', r.d.commandes.length === 1 && r.d.abonnements.length === 0, JSON.stringify([r.d.commandes.length, r.d.abonnements]));
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

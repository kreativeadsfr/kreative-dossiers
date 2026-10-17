// Résilier un abonnement depuis l'espace client : engagement de 3 mois, puis résiliable à tout moment,
// effet à la fin du mois en cours (Stripe cancel_at_period_end). Usage : node test_abonnement.mjs config-test.json
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
t('… résiliable à partir du paiement du 3e mois (début + 2 mois)', (d3.getUTCFullYear() * 12 + d3.getUTCMonth()) - (d1.getUTCFullYear() * 12 + d1.getUTCMonth()) === 2, d1.toISOString() + ' ' + d3.toISOString());
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
t('pendant l\'engagement : résiliation refusée, avec la date', r.s === 409 && /Engagement de 3 mois en cours : vous pourrez résilier à partir du \d+ \S+ \d{4}/.test(r.d.erreur) && !appelsAbo().length, r.s + ' ' + JSON.stringify(r.d));

// 2e et 3e mois payés
await webhook(facture('in_a2', 2, 'subscription_cycle'));
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('2e mois : toujours pas résiliable', ab.mois_payes === 2 && !ab.resiliable, JSON.stringify(ab));
await webhook(facture('in_a3', 3, 'subscription_cycle'));
r = await api('/api/client/moi', CK); ab = r.d.abonnements[0];
t('3e mois payé : résiliable', r.d.abonnements.length === 1 && ab.mois_payes === 3 && ab.resiliable, JSON.stringify(ab));

// sécurité
r = await api('/api/client/abonnement/resilier?client=' + cid, A, 'POST', { abo: 'sub_abo' });
t('l\'admin en aperçu ne peut pas résilier à la place du client', r.s === 403 && !appelsAbo().length, r.s);
r = await api('/api/client/abonnement/resilier', CK2, 'POST', { abo: 'sub_abo' });
t('un autre client ne peut pas résilier cet abonnement', r.s === 404 && !appelsAbo().length, r.s);
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_inexistant' });
t('abonnement inconnu : 404', r.s === 404, r.s);

// la résiliation
r = await api('/api/client/abonnement/resilier', CK, 'POST', { abo: 'sub_abo' });
let L = appelsAbo();
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
t('confirmation de Stripe : pas de ligne en double', r.d.activite.filter(a => a.type === 'abonnement').length === 1, JSON.stringify(r.d.activite));

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

// une commande mensuelle créée à la main dans l'admin (sans Stripe) n'a pas de bouton
r = await api('/api/admin/clients', A, 'POST', { marque: 'Manuel', contact: 'Léa', email: 'lea@manuel.fr' });
const cid3 = r.d.id, CK3 = cookie(await get(r.d.lien.replace(B, '')));
await api('/api/admin/commandes', A, 'POST', { client_id: cid3, pack: 'growth', formule: 'mensuel' });
r = await api('/api/client/moi', CK3);
t('abonnement créé à la main, sans Stripe : pas de résiliation en ligne', r.d.commandes.length === 1 && r.d.abonnements.length === 0, JSON.stringify([r.d.commandes.length, r.d.abonnements]));
console.log('\n' + ok + ' OK, ' + ko + ' en échec');

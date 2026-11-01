// Équipe et Vue d'ensemble : « Dans les délais » se calcule sur le 1er envoi de la fiche et la 1re livraison
// de la designer, pas sur l'envoi au client, la review ou un renvoi (bug du 01/11/2026 : Andrea à 0 %).
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../admin/index.html', import.meta.url), 'utf8');
const prendre = nom => { const i = html.indexOf('function ' + nom + '('); let j = html.indexOf('{', i), n = 0;
  for (; j < html.length; j++) { if (html[j] === '{') n++; if (html[j] === '}' && --n === 0) break; } return html.slice(i, j + 1); };
const S = {};
const f = new Function('S', prendre('livreDesiLe') + '\n' + prendre('bilanEquipe') + '\nreturn { livreDesiLe, bilanEquipe };')(S);
let ok = 0, ko = 0; const t = (nom, c) => { c ? ok++ : (ko++, console.log('ÉCHEC', nom)); };
const h = s => Date.parse(s), now = Date.now();
const iso = ms => new Date(ms).toISOString();
const desi = now - 2 * 36e5, strat = now - 30 * 36e5;
S.prod = [{ dossier: 'A', livre: true, livreLe: now - 36e5, desi, strat, envoye: true, envoyeLe: now - 20 * 36e5, envoyePremierLe: now - 31 * 36e5,
  livraisons: [{ le: iso(now - 3 * 36e5) }] }];
// la version 1 a été envoyée au client et reviewée après l'échéance : ça ne compte pas
S.livraisons = [{ dossier: 'A', version: 1, depose_le: now - 3 * 36e5, envoye_le: now - 36e5, review_le: now - 36e5 }];
t('designer à l\'heure malgré l\'envoi au client après', f.bilanEquipe('designer')[1][1] === '100 %');
t('stratégiste : 1er envoi avant l\'échéance, renvoi après', f.bilanEquipe('strategiste')[1][1] === '100 %');
S.prod[0].livraisons = []; S.livraisons[0].depose_le = now - 36e5;
t('designer en retard si la 1re livraison est après l\'échéance', f.bilanEquipe('designer')[1][1] === '0 %');
S.prod[0].envoyePremierLe = now - 29 * 36e5;
t('stratégiste en retard si le 1er envoi est après', f.bilanEquipe('strategiste')[1][1] === '0 %');
console.log(ok + ' ok, ' + ko + ' en échec');

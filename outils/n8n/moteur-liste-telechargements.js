const d = $input.first().json;

// on va chercher les listes à leur source : plus rien ne peut les perdre en route
const source = (noeud, champ, repli) => {
  try { const v = $(noeud).first().json[champ]; return Array.isArray(v) ? v : repli; }
  catch (e) { return repli; }
};

const assets = source('Visuels du site', 'assets', d.assets || []);
const pubsClient = source('Trier les pubs', 'pubs_client', d.pubs_client || []);
const pubsConcu = source('Retenir les concurrents', 'pubs_concurrents', d.pubs_concurrents || []);

const liste = [];
for (const a of assets) liste.push({ id: a.id, url: a.url });
for (const p of pubsClient) liste.push({ id: p.id, url: p.url });
for (const p of pubsConcu) liste.push({ id: p.id, url: p.url });

// 08/11 : un client sans fichiers envoyés et sans pubs trouvées (Attari) donnait une liste vide :
// la boucle ne tournait pas, et le Moteur s'arrêtait là en « Succeeded », sans dossier ni
// message à la stratégiste. On met alors une petite image neutre (le logo Kreative) pour que
// la suite tourne ; elle n'est utilisée nulle part dans le dossier.
if (!liste.length) liste.push({ id: '_aucune', url: 'https://raw.githubusercontent.com/kreativeadsfr/kreative-dossiers/main/ui/logo-kreative-noir.png' });

return liste.map(x => ({ json: x }));

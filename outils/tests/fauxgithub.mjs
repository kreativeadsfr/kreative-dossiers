import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const RACINE = process.argv[2], PORT = Number(process.argv[3] || 9911), JETON = 'jeton-test';
export const compteur = { n: 0 };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/push/')) { fs.appendFileSync('push.log', JSON.stringify({ chemin: u.pathname, auth: req.headers.authorization, ttl: req.headers.ttl }) + '\n'); res.writeHead(u.pathname.includes('perime') ? 410 : 201); return res.end(); }
  if (u.pathname === '/n8n-livraison') { let b=''; req.on('data', c => b += c); req.on('end', () => { fs.appendFileSync('livraison.log', b + '\n'); res.writeHead(200,{'content-type':'application/json'}); res.end('{"ok":true}'); }); return; }
  if (u.pathname === '/n8n-fiche') { let b=''; req.on('data', c => b += c); req.on('end', () => { const j = JSON.parse(b || '{}'); res.writeHead(j.code === 'code-fiche-test' ? 200 : 409, {'content-type':'application/json'}); if (j.code !== 'code-fiche-test') return res.end('{"code_invalide":true}'); fs.appendFileSync('fiche.log', b + '\n'); res.end('{"ok":true,"envoi":1}'); }); return; }
  if (u.pathname === '/n8n-email') { let b=''; req.on('data', c => b += c); req.on('end', () => { fs.appendFileSync('emails.log', JSON.stringify({ cle: req.headers['x-kreative-cle'], corps: JSON.parse(b) }) + '\n'); res.writeHead(200); res.end('{"ok":true}'); }); return; }
  if (u.pathname === '/v1/checkout/sessions') { let b=''; req.on('data', c => b += c); req.on('end', () => {
    if (req.headers.authorization !== 'Bearer sk_test_faux') { res.writeHead(401,{'content-type':'application/json'}); return res.end('{"error":{"message":"Invalid API Key"}}'); }
    fs.appendFileSync('stripe.log', b + '\n'); res.writeHead(200,{'content-type':'application/json'}); const emb = /ui_mode=embedded/.test(b); res.end(JSON.stringify({ id: 'cs_test_' + Date.now(), url: emb ? null : 'https://checkout.stripe.com/c/pay/cs_test_faux', client_secret: emb ? 'cs_test_faux_secret_123' : null })); }); return; }
  if (u.pathname.startsWith('/v1/coupons/')) {
    if (req.headers.authorization !== 'Bearer sk_test_faux') { res.writeHead(401,{'content-type':'application/json'}); return res.end('{"error":{"message":"Invalid API Key"}}'); }
    if (u.pathname !== '/v1/coupons/FIDELITE') { res.writeHead(404,{'content-type':'application/json'}); return res.end('{"error":{"message":"No such coupon"}}'); }
    res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({ id: 'FIDELITE', object: 'coupon', percent_off: 20, duration: 'once', valid: true })); }
  if (u.pathname.startsWith('/v1/subscriptions/')) { let b=''; req.on('data', c => b += c); req.on('end', () => {
    if (req.headers.authorization !== 'Bearer sk_test_faux') { res.writeHead(401,{'content-type':'application/json'}); return res.end('{"error":{"message":"Invalid API Key"}}'); }
    const id = decodeURIComponent(u.pathname.split('/').pop()), q = Object.fromEntries(new URLSearchParams(b));
    fs.appendFileSync('stripe_abo.log', JSON.stringify({ id, ...q }) + '\n');
    if (id === 'sub_inconnu') { res.writeHead(404,{'content-type':'application/json'}); return res.end('{"error":{"message":"No such subscription"}}'); }
    // l'état de chaque abonnement est gardé, comme chez Stripe
    const fin = Math.floor(Date.now() / 1000) + 20 * 86400, E = (globalThis.ABOS = globalThis.ABOS || {})[id] = globalThis.ABOS[id] || { cape: false, cancel_at: null };
    if ('cancel_at_period_end' in q) { E.cape = q.cancel_at_period_end === 'true'; E.cancel_at = E.cape ? fin : (E.cape_avant ? null : E.cancel_at); E.cape_avant = E.cape; }
    if ('cancel_at' in q) { if (E.cape && q.cancel_at) { res.writeHead(400,{'content-type':'application/json'}); return res.end('{"error":{"message":"cancel_at and cancel_at_period_end cannot both be set"}}'); } E.cancel_at = q.cancel_at ? Number(q.cancel_at) : null; E.cape = false; E.cape_avant = false; }
    const prog = E.cape || !!E.cancel_at;
    res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ id, object: 'subscription', status: 'active', billing_cycle_anchor: Number(globalThis.ANCRE || 0) || undefined, cancel_at_period_end: E.cape, cancel_at: E.cancel_at, canceled_at: prog ? Math.floor(Date.now() / 1000) : null, items: { data: [{ current_period_end: fin }] } })); }); return; }
  // ---- faux Instagram (API « Instagram Login ») pour le Studio : rien ne part sur le vrai compte ----
  if (u.pathname.startsWith('/ig/')) { let b=''; req.on('data', c => b += c); req.on('end', () => {
    const IG = globalThis.IG = globalThis.IG || { n: 0, conteneurs: {}, publies: [] };
    const q = Object.fromEntries(new URLSearchParams(b || u.search)), jeton = q.access_token || u.searchParams.get('access_token');
    const p = u.pathname.replace(/^\/ig\/(v[\d.]+\/)?/, '/'), rep = (s, o) => { res.writeHead(s, {'content-type':'application/json'}); res.end(JSON.stringify(o)); };
    // « Meta bloque l'accès » (API access blocked, code 200) : POST /ig/_bloquer on=1 / on=0
    if (p === '/_bloquer') { IG.bloque = q.on === '1'; return rep(200, { ok: true }); }
    // archiver un reel dans l'app : il disparaît de /media (POST /ig/_archiver id=… on=1 / on=0)
    // un reel dont Instagram refuse toutes les statistiques (reel d'essai…) : POST /ig/_illisible id=… on=1 ; media_ill… est ajouté à la liste
    if (p === '/_illisible') { IG.illisibles = IG.illisibles || {}; IG.illisibles[q.id] = q.on === '1'; return rep(200, { ok: true }); }
    // Cloudflare refuse les appels en trop (« Too many subrequests ») : POST /ig/_limite on=1 ; les statistiques des reels échouent
    if (p === '/_limite') { IG.limite = q.on === '1'; return rep(200, { ok: true }); }
    if (p === '/_archiver') { IG.archives = IG.archives || {}; IG.archives[q.id] = q.on === '1'; return rep(200, { ok: true }); }
    if (IG.bloque) return rep(400, { error: { message: 'API access blocked.', type: 'OAuthException', code: 200 } });
    if (p === '/refresh_access_token') return rep(200, { access_token: 'tok_rafraichi', token_type: 'bearer', expires_in: 5184000 });
    if (!jeton || /^mauvais/.test(jeton)) return rep(400, { error: { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190 } });
    if (p === '/me') return rep(200, { id: '1789', user_id: '1789', username: 'kreative.ads', name: 'Kreative', account_type: 'BUSINESS', followers_count: 1200 + IG.publies.length, media_count: 40, profile_picture_url: '' });
    if (p === '/1789/media' && req.method === 'POST') { fs.appendFileSync('ig.log', JSON.stringify({ quoi: 'conteneur', ...q, access_token: undefined }) + '\n');
      if (/echec/.test(q.caption || '')) return rep(400, { error: { message: 'The video file you selected is in a format that we don\'t support.', code: 352 } });
      const id = 'cont_' + (++IG.n); IG.conteneurs[id] = 0; return rep(200, { id }); }
    if (p === '/1789/media_publish') { fs.appendFileSync('ig.log', JSON.stringify({ quoi: 'publication', creation_id: q.creation_id }) + '\n');
      if (IG.conteneurs[q.creation_id] < 2) return rep(400, { error: { message: 'Media ID is not available', code: 9007 } });
      const id = 'media_' + (++IG.n); IG.publies.push(id); return rep(200, { id }); }
    let m;
    if ((m = p.match(/^\/(cont_\d+)$/))) { IG.conteneurs[m[1]] = (IG.conteneurs[m[1]] || 0) + 1; return rep(200, { id: m[1], status_code: IG.conteneurs[m[1]] >= 2 ? 'FINISHED' : 'IN_PROGRESS' }); }
    const stats = id => { const k = Number(String(id).replace(/\D/g, '')) || 7; return { views: 1000 * k, reach: 800 * k, likes: 50 * k, comments: 3 * k, shares: 9 * k, saved: 4 * k, total_interactions: 66 * k, ig_reels_avg_watch_time: 4200 + k, follows: 2 * k, profile_visits: 11 * k }; };
    if (p === '/1789/media') return rep(200, { data: IG.publies.concat(['media_ext90'], Object.keys(IG.illisibles || {}).filter(id => /^media_ill/.test(id) && IG.illisibles[id])).filter(id => !(IG.archives || {})[id]).map(id => ({ id, caption: id === 'media_ext90' ? 'Un reel posté depuis l\'app' : 'publié par le studio', media_type: 'VIDEO', media_product_type: id === 'media_ext90' ? 'FEED' : 'REELS', permalink: 'https://www.instagram.com/reel/' + id + '/', thumbnail_url: 'http://127.0.0.1:9911/ig/miniature/' + id + '.jpg', timestamp: '2026-10-' + (id === 'media_ext90' ? '02' : '20') + 'T10:00:00+0000', ...(/^media_ill/.test(id) ? { like_count: 7, comments_count: 2 } : {}) })), paging: {} });
    if (p === '/1789/insights') return rep(200, { data: [{ name: 'follower_count', period: 'day', values: [{ value: 12, end_time: '2026-10-19T07:00:00+0000' }, { value: 8, end_time: '2026-10-20T07:00:00+0000' }] }] });
    if ((m = p.match(/^\/(media_[a-z]*\d+)\/insights$/))) { const demande = String(q.metric || '').split(','), s = stats(m[1]);
      fs.appendFileSync('ig.log', JSON.stringify({ quoi: 'stats', id: m[1], metric: q.metric }) + '\n');
      if (IG.limite) return rep(500, { error: { message: 'Too many subrequests by single Worker invocation.' } });
      if ((IG.illisibles || {})[m[1]]) return rep(400, { error: { message: "Unsupported get request. Object with ID '" + m[1] + "' does not exist, cannot be loaded due to missing permissions, or does not support this operation", code: 100, error_subcode: 33 } });
      if (m[1] === 'media_ext90' && demande.length > 1 && demande.includes('follows')) return rep(400, { error: { message: '(#100) Incompatible metric (follows) with media type', code: 100 } });
      if (m[1] === 'media_ext90' && demande.length === 1 && demande[0] === 'follows') return rep(400, { error: { message: '(#100) Incompatible metric', code: 100 } });
      return rep(200, { data: demande.filter(x => x in s).map(name => ({ name, period: 'lifetime', values: [{ value: s[name] }] })) }); }
    if ((m = p.match(/^\/(media_[a-z]*\d+)$/))) return rep(200, { id: m[1], permalink: 'https://www.instagram.com/reel/' + m[1] + '/', thumbnail_url: 'http://127.0.0.1:9911/ig/miniature/' + m[1] + '.jpg', timestamp: '2026-10-20T10:00:00+0000', media_product_type: 'REELS' });
    rep(404, { error: { message: 'Unknown path ' + p, code: 803 } });
  }); return; }
  if (req.headers.authorization !== 'Bearer ' + JETON) { res.writeHead(401); return res.end('{"message":"Bad credentials"}'); }
  compteur.n++;
  const m = u.pathname.match(/^\/repos\/kreativeadsfr\/kreative-dossiers\/contents\/(.*)$/);
  if (m) {
    const rel = decodeURIComponent(m[1]); const OV = process.argv[4]; let f = path.join(RACINE, rel); if (OV && rel && fs.existsSync(path.join(OV, rel)) && fs.statSync(path.join(OV, rel)).isFile()) f = path.join(OV, rel);
    if ((!f.startsWith(RACINE) && !(process.argv[4] && f.startsWith(process.argv[4]))) || !fs.existsSync(f)) { res.writeHead(404); return res.end('{"message":"Not Found"}'); }
    if (fs.statSync(f).isDirectory()) { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify(fs.readdirSync(f).map(n=>({name:n,type:fs.statSync(path.join(f,n)).isDirectory()?'dir':'file'})))); }
    if ((req.headers.accept||'').includes('raw')) { const b = fs.readFileSync(f); res.writeHead(200, {'content-type':'application/vnd.github.raw', 'content-length': b.length}); return res.end(b); }
    res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ sha: 'sha-'+rel, content: fs.readFileSync(f).toString('base64') }));
  }
  if (u.pathname === '/repos/kreativeadsfr/kreative-dossiers/git/ref/heads/main') { res.writeHead(200,{'content-type':'application/json'}); return res.end('{"object":{"sha":"abc123"}}'); }
  if (u.pathname === '/repos/kreativeadsfr/kreative-dossiers/git/commits/abc123') { res.writeHead(200,{'content-type':'application/json'}); return res.end('{"tree":{"sha":"t1"}}'); }
  if (u.pathname === '/repos/kreativeadsfr/kreative-dossiers/git/trees/t1') {
    const out=[]; const walk=(d,pre)=>{ for (const n of fs.readdirSync(d)) { if (n==='.git') continue; const f=path.join(d,n); if (fs.statSync(f).isDirectory()) walk(f,pre+n+'/'); else out.push({path:pre+n,mode:'100644',type:'blob',sha:'x',size:fs.statSync(f).size}); } };
    walk(RACINE,''); res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({truncated:false,tree:out})); }
  res.writeHead(404); res.end('{"message":"Not Found"}');
}).listen(PORT, () => console.log('faux github', PORT));

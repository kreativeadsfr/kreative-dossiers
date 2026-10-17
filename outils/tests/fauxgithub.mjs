import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const RACINE = process.argv[2], PORT = Number(process.argv[3] || 9911), JETON = 'jeton-test';
export const compteur = { n: 0 };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/push/')) { fs.appendFileSync('push.log', JSON.stringify({ chemin: u.pathname, auth: req.headers.authorization, ttl: req.headers.ttl }) + '\n'); res.writeHead(u.pathname.includes('perime') ? 410 : 201); return res.end(); }
  if (u.pathname === '/n8n-livraison') { let b=''; req.on('data', c => b += c); req.on('end', () => { fs.appendFileSync('livraison.log', b + '\n'); res.writeHead(200,{'content-type':'application/json'}); res.end('{"ok":true}'); }); return; }
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

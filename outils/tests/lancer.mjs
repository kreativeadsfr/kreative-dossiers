import { Miniflare } from 'miniflare'; import fs from 'node:fs';
const sec = JSON.parse(fs.readFileSync(process.argv[2]));
const ROLES = {dario:'admin', andrea:'designer', strategiste:'strategiste'};
const ACCES = Object.entries(sec.ACCES).map(([n,m])=>n+'='+m+':'+ROLES[n]).join(', ');
const mf = new Miniflare({ modules: true, script: fs.readFileSync(process.argv[3],'utf8'), port: Number(process.argv[4]||8787), host: '127.0.0.1',
  compatibilityDate: '2025-01-01',
  d1Databases: ['DB'], d1Persist: false, r2Buckets: ['FICHIERS'], r2Persist: false,
  bindings: { GITHUB_TOKEN: 'jeton-test', ACCES, CLE: sec.CLE, GITHUB_API: 'http://127.0.0.1:9911', N8N_EMAIL: 'http://127.0.0.1:9911/n8n-email', STRIPE_SECRET: 'sk_test_faux', STRIPE_PUBLIC: 'pk_test_faux', STRIPE_WEBHOOK_SECRET: 'whsec_test_faux', STRIPE_API: 'http://127.0.0.1:9911', N8N_LIVRAISON: 'http://127.0.0.1:9911/n8n-livraison', N8N_FICHE: 'http://127.0.0.1:9911/n8n-fiche', CODE_FICHE: 'code-fiche-test', PUSH_TEST: 'http://127.0.0.1:9911/push/', INSTAGRAM_API: 'http://127.0.0.1:9911/ig' } });
await mf.ready; console.log('worker prêt', process.argv[4]||8787);

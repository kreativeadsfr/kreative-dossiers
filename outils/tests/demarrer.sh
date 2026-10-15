#!/usr/bin/env bash
# Démarre le banc de test local : un faux GitHub (port 9911) et le Worker dans Miniflare (port 8787).
# Aucune vraie clé : config-test.json contient des mots de passe et une clé de test.
cd "$(dirname "$0")"
REPO="$(cd ../.. && pwd)"
CONFIG="${KREATIVE_TEST_CONFIG:-config-test.json}"
[ -d node_modules ] || npm install --silent
curl -s -o /dev/null http://127.0.0.1:9911/ || (nohup node fauxgithub.mjs "$REPO" 9911 "$PWD/fixtures" > fg.log 2>&1 &)
curl -s -o /dev/null http://127.0.0.1:8787/_connexion || (nohup node lancer.mjs "$CONFIG" "$REPO/outils/cloudflare/worker.js" 8787 > mf.log 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8787/_connexion && break; sleep 1; done

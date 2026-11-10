#!/usr/bin/env bash
# Lance toutes les suites, chacune sur une base vide. Usage : bash outils/tests/tout.sh
cd "$(dirname "$0")"
CONFIG="${KREATIVE_TEST_CONFIG:-config-test.json}"
for t in test_syntaxe test_worker test_portail test_stripe test_abonnement test_livraisons test_roles test_kanban test_retour test_app test_demo test_wimmov test_wimmov_paiement test_studio test_delais_equipe test_revisions test_projets test_inspi; do
  bash relance.sh
  printf '%-16s ' "$t"; node "$t.mjs" "$CONFIG" 2>&1 | grep -E 'en échec' | tail -1
done

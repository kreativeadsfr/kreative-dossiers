#!/usr/bin/env bash
# Redémarre le banc avec une base vide (à faire avant chaque suite de tests).
cd "$(dirname "$0")"
pkill -f '^node lancer.mjs' ; pkill -f '^node fauxgithub.mjs' ; sleep 1
rm -f emails.log stripe.log livraison.log push.log
bash demarrer.sh >/dev/null 2>&1
sleep 3

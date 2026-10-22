#!/bin/bash
# Diagnostic: how many ORK nodes answer right now?
ok=0
for i in $(seq 1 20); do
  code=$(curl -sS -m 6 -o /dev/null -w '%{http_code}' "https://ork$i.tideprotocol.com/" 2>/dev/null)
  [ -z "$code" ] && code="TIMEOUT"
  case "$code" in 2*|3*|4*) ok=$((ok+1));; esac
  echo "ork$i $code"
done
echo "reachable=$ok/20"

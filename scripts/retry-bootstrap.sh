#!/bin/bash
# Dev helper: Tide's ORK was returning 500 / timing out during licence setup.
# Retry the bootstrap a few times; stop on success.
cd "$(dirname "$0")/.." || exit 1
for i in 1 2 3 4 5 6 7 8; do
  echo "### ATTEMPT $i ###"
  if bash scripts/init-tidecloak.sh; then
    echo "### BOOTSTRAP OK ###"
    exit 0
  fi
  echo "### ATTEMPT $i FAILED, sleeping 15s ###"
  sleep 15
done
echo "### ALL ATTEMPTS FAILED ###"
exit 1

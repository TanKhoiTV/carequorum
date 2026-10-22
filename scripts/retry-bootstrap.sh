#!/bin/bash
# Fresh realm per attempt (stale remote vendor state is a possible cause),
# short backoff, stop as soon as the licence lands.
cd "$(dirname "$0")/.." || exit 1
for i in 1 2 3 4 5 6 7 8 9 10; do
  R="careq$i$RANDOM"
  echo "### ATTEMPT $i (realm $R) ###"
  if REALM_NAME="$R" CLIENT_NAME="$R-client" bash scripts/init-tidecloak.sh; then
    echo "### BOOTSTRAP OK ###"
    exit 0
  fi
  echo "### ATTEMPT $i FAILED ###"
  sleep 10
done
echo "### ALL ATTEMPTS FAILED ###"
exit 1

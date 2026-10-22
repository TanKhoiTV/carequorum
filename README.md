# CareQuorum

**CareQuorum is a patient-owned medical record exchange where a record unlocks only when the patient consents and a treating clinician co-signs — no administrator, hospital or vendor can do it alone.**

Built with [TideCloak](https://tide.org/tidecloak) for UNLOCKED (Challenge 2, RMIT hackathon 2026).

## Project overview

### 1. Vision & originality
Records should belong to the person they describe, not the institution holding a copy. CareQuorum makes consent an enforced quorum: patient + clinician, two distinct verified identities, a sealed ten-minute window. The same pattern fits any shared resource that today needs a trusted operator — consent as infrastructure, not a checkbox.

### 2. Trust constraint insight
Sharing a record today needs someone with god-mode: a hospital admin, the EHR vendor, or whoever runs the cloud. Any of them can read, export or unlock everything, so patients are asked to trust process rather than proof. CareQuorum removes that single point of authority. An administrator who owns the servers still cannot read Maya's oncology notes. Emergency care gets faster because consent is explicit instead of improvised.

### 3. Value & impact
Maya keeps control of a sensitive history years after treatment. Her GP can request it at 2am; the receiving hospital co-signs with clinical need; Maya consents from her phone; access expires in ten minutes. No faxes, no blanket consent forms, no "just email it across".

### 4. Why TideCloak matters
Every party signs in through TideCloak and receives a DPoP-bound token. CareQuorum verifies signature, client, roles and the DPoP proof on the server for every request, so a stolen token cannot be replayed and the browser is never trusted. The quorum needs two distinct verified identities, and the admin role is excluded by policy — not by a settings screen someone could edit. TideCloak's IGA keeps realm governance multi-party too, so no one can quietly widen their own power. Remove TideCloak and this UI is theatre: an admin with database access wins.

### 5. Prototype & storytelling
Sign in, bind a role, then watch four beats: press **Try admin override** — refused and audited; approve as the patient; co-sign as the clinician; open the record and watch the sealed window count down. Every step, including the refusal, is a hash-chained audit entry.

## Setup

Prerequisites: Node 20+, Docker, and a TideCloak dev server on port 8080.

```bash
cp .env.example .env          # set KC_BOOTSTRAP_ADMIN_PASSWORD + TIDE_LICENSE_EMAIL
docker run -d --name tidecloak -p 8080:8080 \
  -v "$PWD/data:/opt/keycloak/data/h2" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD" \
  tideorg/tidecloak-dev:latest
npm install
npm run init                  # creates the realm, licence and first admin; open the invite link
npm run dev                   # http://localhost:3000
```

Then sign in with Tide and choose a role. The record, the requests and the audit trail are synthetic; no real patient data is used.

> **Demo note.** A second enrolled device is not practical inside a two-minute recording, so the console offers a **demo co-sign** for the clinician. It is a distinct identity, it is labelled in the audit trail, and patient consent can never be simulated. With a second enrolled Tide identity the same button is replaced by that person signing in and pressing *Approve*.

## How it works

- `src/lib/policy.ts` — the quorum: two distinct identities, patient consent mandatory, admins excluded, 15-minute cap.
- `src/lib/auth/` — token + DPoP verification, generated from Tide's verified template; do not relax it.
- `src/app/api/requests/[id]/override/route.ts` — the god-mode attempt, always refused and always audited.
- `src/app/api/records/[id]/route.ts` — the only path to record data; checks the sealed grant and its expiry on every read.
- `src/lib/store.ts` — hash-chained audit log and HMAC-sealed grants.

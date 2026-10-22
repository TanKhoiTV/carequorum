import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/protect";
import { audit, getDB, saveDB } from "@/lib/store";
import { POLICY } from "@/lib/policy";

export const dynamic = "force-dynamic";

/**
 * The god-mode button.
 *
 * A realm administrator asks CareQuorum to unlock the record without the
 * quorum. This endpoint exists so the refusal is explicit, auditable and
 * impossible to miss in a demo: administrative authority is not access
 * authority.
 */
export const POST = withAuth(async (req: NextRequest, jwt) => {
  const db = getDB();
  const sub = jwt.sub as string;
  const me = db.bindings[sub];
  const url = new URL(req.url);
  const id = url.pathname.split("/").slice(-2)[0];
  const request = db.requests.find((r) => r.id === id);
  if (!request) return Response.json({ error: "Unknown request" }, { status: 404 });

  const who = me?.name ?? `identity ${sub.slice(0, 12)}…`;
  if (me?.role !== "admin") {
    audit(db, who, "override.refused", `${request.id}: caller does not hold the admin role`, "DENY");
    saveDB(db);
    return Response.json({ error: "Only a realm administrator can attempt an override." }, { status: 403 });
  }

  request.overrideAttempts.push({ at: Date.now(), actor: who });
  audit(
    db,
    who,
    "override.denied",
    `${request.id}: unilateral unlock attempted and refused — quorum policy is sealed to ${POLICY.requiredApprovals} distinct identities`,
    "DENY"
  );
  saveDB(db);

  return Response.json(
    {
      denied: true,
      title: "Override refused",
      detail:
        "Administrative authority is not access authority. This record unlocks only when the patient consents and a treating clinician co-signs — two distinct verified Tide identities. Your identity is deliberately outside that quorum, and the policy cannot be edited unilaterally.",
      policy: {
        requiredApprovals: POLICY.requiredApprovals,
        requiredRoles: POLICY.requiredRoles,
        adminExcluded: true,
      },
    },
    { status: 403 }
  );
});

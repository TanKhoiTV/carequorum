import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/protect";
import { audit, getDB, saveDB, sealGrant, type Actor } from "@/lib/store";
import { evaluatePolicy } from "@/lib/policy";

export const dynamic = "force-dynamic";

/**
 * Record an approval.
 *
 * A caller can only ever approve as themselves: the actor is taken from the
 * verified Tide token (`jwt.sub`), never from the request body. The single
 * exception is the demo counterparty, which exists so a 2-minute video can show
 * two parties without a second enrolled device; it is a distinct synthetic
 * identity, it is flagged in the audit trail, and it is off unless
 * DEMO_COUNTERPARTY=1.
 */
export const POST = withAuth(async (req: NextRequest, jwt) => {
  const db = getDB();
  const sub = jwt.sub as string;
  const url = new URL(req.url);
  const id = url.pathname.split("/").slice(-2)[0];
  const request = db.requests.find((r) => r.id === id);
  if (!request) return Response.json({ error: "Unknown request" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { demoRole?: "clinician" | "patient" };

  let actor: Actor | null = null;

  if (body.demoRole) {
    if (process.env.DEMO_COUNTERPARTY !== "1") {
      return Response.json({ error: "Demo counterparty is disabled" }, { status: 403 });
    }
    actor = {
      sub: `demo:${body.demoRole}`,
      name: body.demoRole === "clinician" ? "Dr. Priya Chen" : "Maya Okafor",
      role: body.demoRole,
      simulated: true,
    };
  } else {
    const me = db.bindings[sub];
    if (!me) {
      return Response.json(
        { error: "Bind this Tide identity to a role first (POST /api/state)." },
        { status: 409 }
      );
    }
    actor = { sub, name: me.name, role: me.role };
  }

  if (request.status !== "PENDING") {
    return Response.json({ error: `Request is ${request.status}` }, { status: 409 });
  }
  if (actor.role === "admin") {
    audit(
      db,
      actor.name,
      "approval.denied",
      `${request.id}: administrators are excluded from the approval quorum`,
      "DENY"
    );
    saveDB(db);
    return Response.json(
      {
        error:
          "Administrators cannot approve access. This role is deliberately outside the quorum.",
      },
      { status: 403 }
    );
  }
  if (request.approvals.some((a) => a.actor.sub === actor!.sub)) {
    return Response.json({ error: "This identity has already approved" }, { status: 409 });
  }

  request.approvals.push({ actor, at: Date.now() });
  audit(
    db,
    actor.name,
    "approval.record",
    `${request.id}: ${actor.role} approval (${actor.simulated ? "demo counterparty" : "verified Tide identity"})`,
    "ALLOW"
  );

  const check = evaluatePolicy(request);
  if (check.ok) {
    const minutes = Math.min(request.minutes, 15);
    request.status = "GRANTED";
    const expiresAt = Date.now() + minutes * 60_000;
    request.grant = {
      issuedAt: Date.now(),
      expiresAt,
      seal: sealGrant(db, request, expiresAt),
    };
    audit(
      db,
      "CareQuorum policy engine",
      "access.granted",
      `${request.id}: quorum reached (${check.approvals}/${check.required}); sealed ${minutes} min window`,
      "ALLOW"
    );
  }

  saveDB(db);
  return Response.json({ request, check });
});

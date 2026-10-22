import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/protect";
import { audit, getDB, saveDB, verifySeal } from "@/lib/store";
import { PATIENTS } from "@/lib/policy";

export const dynamic = "force-dynamic";

/** The actual record read. Every read is gated, sealed and audited. */
export const GET = withAuth(async (req: NextRequest, jwt) => {
  const db = getDB();
  const me = db.bindings[jwt.sub as string];
  const url = new URL(req.url);
  const recordId = url.pathname.split("/").pop() as string;
  const requestId = url.searchParams.get("requestId") ?? "";
  const request = db.requests.find((r) => r.id === requestId);

  const deny = (reason: string, status = 403) => {
    audit(db, me?.name ?? "unknown", "record.read.denied", `${recordId}: ${reason}`, "DENY");
    saveDB(db);
    return Response.json({ error: reason }, { status });
  };

  if (!request) return deny("No access request on file.");
  if (request.recordId !== recordId) return deny("Request does not cover this record.");
  if (request.status !== "GRANTED" || !request.grant) return deny("No granted window for this request.");
  if (!verifySeal(db, request)) return deny("Grant seal does not verify — the record was tampered with.");
  if (request.grant.expiresAt < Date.now()) {
    request.status = "REVOKED";
    saveDB(db);
    return deny("The granted window has expired. Request access again.");
  }

  const patient = PATIENTS.find((p) => p.id === request.patientId);
  const record = patient?.records.find((r) => r.id === recordId);
  if (!record) return deny("Record not found.", 404);

  audit(
    db,
    me?.name ?? "unknown",
    "record.read.allowed",
    `${recordId}: sealed grant ${request.grant.seal.slice(0, 12)}… opened, expires ${new Date(
      request.grant.expiresAt
    ).toLocaleTimeString()}`,
    "ALLOW"
  );
  saveDB(db);

  return Response.json({
    record,
    grant: {
      expiresAt: request.grant.expiresAt,
      seal: request.grant.seal,
      approvals: request.approvals.map((a) => ({
        name: a.actor.name,
        role: a.actor.role,
        simulated: !!a.actor.simulated,
      })),
    },
  });
});

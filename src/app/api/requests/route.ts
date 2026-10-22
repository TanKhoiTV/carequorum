import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/protect";
import { audit, getDB, saveDB } from "@/lib/store";
import { PATIENTS, clampMinutes } from "@/lib/policy";

export const dynamic = "force-dynamic";

/** A clinician asks for time-boxed access to one record. */
export const POST = withAuth(async (req: NextRequest, jwt) => {
  const db = getDB();
  const me = db.bindings[jwt.sub as string];
  const body = (await req.json().catch(() => ({}))) as {
    patientId?: string;
    recordId?: string;
    reason?: string;
    minutes?: number;
    requesterName?: string;
    requesterOrg?: string;
  };

  const patient = PATIENTS.find((p) => p.id === body.patientId);
  const record = patient?.records.find((r) => r.id === body.recordId);
  if (!patient || !record) {
    return Response.json({ error: "Unknown patient or record" }, { status: 404 });
  }

  const request = {
    id: `req-${Math.floor(1000 + Math.random() * 9000)}`,
    patientId: patient.id,
    patientName: patient.name,
    recordId: record.id,
    recordTitle: record.title,
    requester: {
      name: body.requesterName?.trim() || me?.name || "External clinician",
      org: body.requesterOrg?.trim() || "St Vincent's Hospital",
      role: "Attending clinician",
    },
    reason: body.reason?.trim() || "Clinical review requested at point of care.",
    minutes: clampMinutes(body.minutes ?? 10),
    createdAt: Date.now(),
    status: "PENDING" as const,
    approvals: [],
    overrideAttempts: [],
  };

  db.requests.unshift(request);
  audit(
    db,
    request.requester.name,
    "access.request",
    `Requested ${record.title} for ${patient.name} (${request.minutes} min)`,
    "INFO"
  );
  saveDB(db);
  return Response.json({ request }, { status: 201 });
});

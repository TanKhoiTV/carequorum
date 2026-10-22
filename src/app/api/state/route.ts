import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/protect";
import { audit, getDB, saveDB, type Role } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, jwt) => {
  const db = getDB();
  const me = db.bindings[jwt.sub as string] ?? null;
  return Response.json({ me, requests: db.requests, audit: db.audit });
});

/** Bind this Tide identity to a role for the lifetime of the prototype. */
export const POST = withAuth(async (req: NextRequest, jwt) => {
  const db = getDB();
  const sub = jwt.sub as string;
  const body = (await req.json().catch(() => ({}))) as { name?: string; role?: Role };
  const role = body.role;
  if (!role || !["patient", "clinician", "admin"].includes(role)) {
    return Response.json({ error: "role must be patient, clinician or admin" }, { status: 400 });
  }
  const name =
    body.name?.trim() ||
    (role === "patient" ? "Maya Okafor" : role === "clinician" ? "Dr. Priya Chen" : "Realm administrator");

  db.bindings[sub] = { name, role, boundAt: Date.now() };
  audit(db, name, "identity.bind", `Tide identity ${sub.slice(0, 12)}… bound to role ${role}`, "INFO");
  saveDB(db);
  return Response.json({ me: db.bindings[sub] });
});

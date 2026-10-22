import crypto from "crypto";
import fs from "fs";
import path from "path";

export type Role = "patient" | "clinician" | "admin";

export type Actor = {
  sub: string;
  name: string;
  role: Role;
  simulated?: boolean;
};

export type Approval = {
  actor: Actor;
  at: number;
};

export type AuditEvent = {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
  result: "ALLOW" | "DENY" | "INFO";
  prevHash: string;
  hash: string;
};

export type AccessRequest = {
  id: string;
  patientId: string;
  patientName: string;
  recordId: string;
  recordTitle: string;
  requester: { name: string; org: string; role: string };
  reason: string;
  minutes: number;
  createdAt: number;
  status: "PENDING" | "GRANTED" | "DENIED" | "REVOKED";
  approvals: Approval[];
  grant?: { issuedAt: number; expiresAt: number; seal: string };
  overrideAttempts: { at: number; actor: string }[];
};

export type Binding = { name: string; role: Role; boundAt: number };

export type DB = {
  requests: AccessRequest[];
  audit: AuditEvent[];
  bindings: Record<string, Binding>;
  secret: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "carequorum-state.json");

function genesis(): DB {
  return {
    requests: seedRequests(),
    audit: [],
    bindings: {},
    secret: crypto.randomBytes(32).toString("hex"),
  };
}

function seedRequests(): AccessRequest[] {
  const now = Date.now();
  return [
    {
      id: "req-1042",
      patientId: "p-maya",
      patientName: "Maya Okafor",
      recordId: "rec-mri",
      recordTitle: "MRI — lumbar spine + oncology notes",
      requester: {
        name: "Dr. Priya Chen",
        org: "St Vincent's Hospital",
        role: "Attending radiologist",
      },
      reason:
        "Maya was admitted to ED tonight with acute back pain. I need the prior oncology imaging to rule out metastatic recurrence before ordering a second scan.",
      minutes: 10,
      createdAt: now - 1000 * 60 * 4,
      status: "PENDING",
      approvals: [],
      overrideAttempts: [],
    },
  ];
}

function read(): DB {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw) as DB;
  } catch {
    const db = genesis();
    write(db);
    return db;
  }
}

function write(db: DB) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

export function getDB(): DB {
  return read();
}

export function saveDB(db: DB) {
  write(db);
}

export function resetDB(): DB {
  const db = genesis();
  write(db);
  return db;
}

/** Append a tamper-evident audit event (hash chain). */
export function audit(
  db: DB,
  actor: string,
  action: string,
  detail: string,
  result: AuditEvent["result"]
): AuditEvent {
  const prevHash = db.audit.length ? db.audit[db.audit.length - 1].hash : "0".repeat(64);
  const at = Date.now();
  const body = JSON.stringify({ at, actor, action, detail, result, prevHash });
  const hash = crypto.createHash("sha256").update(body).digest("hex");
  const event: AuditEvent = {
    id: `ev-${db.audit.length + 1}`,
    at,
    actor,
    action,
    detail,
    result,
    prevHash,
    hash,
  };
  db.audit.push(event);
  return event;
}

export function sealGrant(db: DB, request: AccessRequest, expiresAt: number): string {
  return crypto
    .createHmac("sha256", db.secret)
    .update(
      JSON.stringify({
        id: request.id,
        patientId: request.patientId,
        recordId: request.recordId,
        approvals: request.approvals.map((a) => a.actor.sub).sort(),
        expiresAt,
      })
    )
    .digest("hex");
}

export function verifySeal(db: DB, request: AccessRequest): boolean {
  if (!request.grant) return false;
  const expected = sealGrant(db, request, request.grant.expiresAt);
  return expected === request.grant.seal;
}

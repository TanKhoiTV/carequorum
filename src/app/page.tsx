"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";

type Role = "patient" | "clinician" | "admin";
type Me = { name: string; role: Role } | null;

type Approval = { actor: { name: string; role: Role; simulated?: boolean }; at: number };
type Req = {
  id: string;
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
type Ev = {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
  result: "ALLOW" | "DENY" | "INFO";
  hash: string;
};
type Record = {
  title: string;
  sensitivity: string;
  summary: string;
  fields: { label: string; value: string }[];
};

const ROLES: { role: Role; name: string; blurb: string }[] = [
  { role: "patient", name: "Maya Okafor", blurb: "Record owner. Only she can consent." },
  { role: "clinician", name: "Dr. Priya Chen", blurb: "Treating clinician. Can co-sign." },
  { role: "admin", name: "Realm administrator", blurb: "Full infrastructure control — and no access." },
];

export default function Home() {
  const { authenticated, isInitializing, login, logout, secureFetch } = useTideCloak();

  if (isInitializing) {
    return (
      <div className="wrap">
        <p className="mono">Connecting to TideCloak…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="wrap">
        <div className="login">
          <div className="brand" style={{ justifyContent: "center" }}>
            <div className="brand-mark">CQ</div>
            <div style={{ textAlign: "left" }}>
              <h1>CareQuorum</h1>
              <span>UNLOCKED · RMIT × Tide</span>
            </div>
          </div>
          <p className="hero-tag" style={{ marginTop: 28 }}>
            Patient-owned medical records
          </p>
          <h1 style={{ fontSize: 38 }}>
            No one can unlock
            <br />
            your record alone.
          </h1>
          <p>
            Hospitals can share what matters — only when the patient consents and a treating
            clinician co-signs. Not an administrator, not the cloud, not the vendor.
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
            <button className="btn primary" onClick={() => login()}>
              Sign in with Tide
            </button>
          </div>
          <p style={{ fontSize: 12.5, marginTop: 18 }}>
            Authentication, identity and the approval quorum are enforced by TideCloak.
          </p>
        </div>
      </div>
    );
  }

  return <Console onLogout={() => logout()} secureFetch={secureFetch} />;
}

function Console({
  onLogout,
  secureFetch,
}: {
  onLogout: () => void;
  secureFetch: (url: string, init?: RequestInit) => Promise<Response>;
}) {
  const [me, setMe] = useState<Me>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [audit, setAudit] = useState<Ev[]>([]);
  const [record, setRecord] = useState<Record | null>(null);
  const [grant, setGrant] = useState<{ expiresAt: number; seal: string; approvals: any[] } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const res = await secureFetch("/api/state");
    if (!res.ok) {
      setToast({ ok: false, title: "Could not load state", body: await res.text() });
      return;
    }
    const data = await res.json();
    setMe(data.me);
    setReqs(data.requests);
    setAudit(data.audit);
    const live = (data.requests as Req[]).find((r) => r.status === "GRANTED");
    if (!live) {
      setRecord(null);
      setGrant(null);
    }
  }, [secureFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const req = useMemo(
    () => reqs.find((r) => r.status === "PENDING") ?? reqs[0] ?? null,
    [reqs]
  );

  const bind = async (role: Role) => {
    setBusy(true);
    const persona = ROLES.find((r) => r.role === role)!;
    const res = await secureFetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name: persona.name }),
    });
    setBusy(false);
    if (!res.ok) {
      setToast({ ok: false, title: "Could not bind identity", body: await res.text() });
      return;
    }
    await load();
  };

  const post = async (path: string, body: unknown = {}) => {
    setBusy(true);
    const res = await secureFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    await load();
    return { ok: res.ok, data };
  };

  const approve = async (demoRole?: Role) => {
    if (!req) return;
    const { ok, data } = await post(`/api/requests/${req.id}/approve`, demoRole ? { demoRole } : {});
    if (ok) {
      if (data.request?.status === "GRANTED") {
        setToast({
          ok: true,
          title: "Quorum reached — window sealed",
          body: `Two distinct identities approved. Access is limited to ${req.minutes} minutes and cannot be extended by an administrator.`,
        });
      } else {
        setToast({ ok: true, title: "Approval recorded", body: "One more distinct identity is required." });
      }
    } else {
      setToast({ ok: false, title: "Approval refused", body: data.error ?? "Request failed." });
    }
  };

  const override = async () => {
    if (!req) return;
    const { data } = await post(`/api/requests/${req.id}/override`);
    setToast({
      ok: false,
      title: data.title ?? "Override refused",
      body: data.detail ?? data.error ?? "The policy refused this action.",
    });
  };

  const openRecord = async () => {
    if (!req) return;
    setBusy(true);
    const res = await secureFetch(`/api/records/${req.recordId}?requestId=${req.id}`);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast({ ok: false, title: "Record stayed sealed", body: data.error ?? "Access denied." });
      await load();
      return;
    }
    setRecord(data.record);
    setGrant(data.grant);
    await load();
  };

  if (!me) {
    return (
      <div className="wrap">
        <TopBar onLogout={onLogout} name="Tide identity verified" role="unbound" />
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Which party are you?</h2>
          <p className="sub">
            Your session is already verified by TideCloak. Bind this identity to one role in the
            prototype — the server stores the binding, not the browser.
          </p>
          <div className="persona">
            {ROLES.map((p) => (
              <button key={p.role} disabled={busy} onClick={() => bind(p.role)}>
                <b>{p.name}</b>
                <small>{p.blurb}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const approvedSubs = new Set((req?.approvals ?? []).map((a) => `${a.actor.role}`));
  const patientOk = approvedSubs.has("patient");
  const clinicianOk = approvedSubs.has("clinician");
  const remaining = grant ? Math.max(0, Math.floor((grant.expiresAt - now) / 1000)) : 0;

  return (
    <div className="wrap">
      <TopBar onLogout={onLogout} name={me.name} role={me.role} />

      <div className="grid">
        <div>
          <div className="card">
            <div className="req-head">
              <div>
                <h2 style={{ marginBottom: 2 }}>Access request</h2>
                <p className="sub" style={{ margin: 0 }}>
                  {req ? `${req.id} · raised ${new Date(req.createdAt).toLocaleTimeString()}` : "No requests"}
                </p>
              </div>
              {req && (
                <span className={`pill ${req.status === "GRANTED" ? "granted" : "pending"}`}>
                  {req.status === "PENDING" ? "AWAITING QUORUM" : req.status}
                </span>
              )}
            </div>

            {!req && <p className="sub">Reset the demo to seed a request.</p>}

            {req && (
              <>
                <div style={{ marginTop: 14 }}>
                  <p className="req-title">{req.recordTitle}</p>
                  <p className="req-who">
                    {req.patientName} · requested by {req.requester.name}, {req.requester.org}
                  </p>
                </div>

                <div className="reason">“{req.reason}”</div>

                <div className="policy">
                  <h3>Quorum policy — sealed by TideCloak</h3>
                  <div className="step">
                    <span className={`tick ${patientOk ? "on" : ""}`}>{patientOk ? "✓" : "1"}</span>
                    <div>
                      <b>Patient consent</b>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Maya Okafor, as a verified identity
                      </div>
                    </div>
                  </div>
                  <div className="step">
                    <span className={`tick ${clinicianOk ? "on" : ""}`}>{clinicianOk ? "✓" : "2"}</span>
                    <div>
                      <b>Treating clinician co-sign</b>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        A second, distinct Tide identity
                      </div>
                    </div>
                  </div>
                  <div className="step">
                    <span className="tick no">✕</span>
                    <div>
                      <b>Administrator override</b>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Never counts toward the quorum
                      </div>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <button className="btn primary" disabled={busy || me.role === "admin"} onClick={() => approve()}>
                    Approve as {me.role}
                  </button>
                  <button
                    className="btn ghost"
                    disabled={busy || clinicianOk}
                    onClick={() => approve("clinician")}
                    title="Demo counterparty: a second synthetic identity, flagged in the audit log"
                  >
                    Co-sign as Dr. Chen (demo)
                  </button>
                  <button className="btn danger" disabled={busy} onClick={override}>
                    Try admin override
                  </button>
                </div>
                <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
                  The demo co-sign exists because a second-party device is not available in a
                  two-minute recording. It is a distinct identity and is marked as simulated in the
                  audit trail.
                </p>
              </>
            )}

            {toast && (
              <div className={`toast ${toast.ok ? "ok" : ""}`}>
                <b>{toast.title}</b>
                {toast.body}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2>Audit trail</h2>
            <p className="sub">
              Hash-chained and written server-side. Every denied override is part of the record.
            </p>
            <div className="audit">
              {audit.length === 0 && <p className="sub">No events yet.</p>}
              {[...audit].reverse().map((e) => (
                <div className="ev" key={e.id}>
                  <div className="t mono">{new Date(e.at).toLocaleTimeString()}</div>
                  <div>
                    <span className="a">{e.actor}</span>
                    <span className={`badge ${e.result.toLowerCase()}`}>{e.result}</span>
                    <div className="d">{e.detail}</div>
                    <div className="h mono">{e.hash.slice(0, 24)}…</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="req-head">
              <div>
                <h2>Patient record</h2>
                <p className="sub" style={{ margin: 0 }}>
                  {req ? req.recordTitle : "—"}
                </p>
              </div>
              <span className={`pill ${record ? "granted" : ""}`}>{record ? "UNSEALED" : "SEALED"}</span>
            </div>

            {!record && (
              <div className="locked" style={{ marginTop: 16 }}>
                <div className="lockicon">🔒</div>
                <div>
                  Sealed until the quorum is met.
                  <br />
                  No administrator can change that.
                </div>
                {req?.status === "GRANTED" && (
                  <button className="btn primary" disabled={busy} onClick={openRecord}>
                    Open record ({remaining}s left)
                  </button>
                )}
              </div>
            )}

            {record && grant && (
              <div className="record" style={{ marginTop: 16 }}>
                <h3>{record.title}</h3>
                <p className="sub" style={{ margin: "2px 0 10px" }}>
                  {record.sensitivity} · window closes in {remaining}s
                </p>
                {record.fields.map((f) => (
                  <div className="field" key={f.label}>
                    <b>{f.label}</b>
                    {f.value}
                  </div>
                ))}
                <div className="field">
                  <b>Seal</b>
                  <span className="mono" style={{ fontSize: 11.5 }}>
                    {grant.seal.slice(0, 40)}…
                  </span>
                </div>
                <div className="field">
                  <b>Approved by</b>
                  {grant.approvals.map((a) => `${a.name} (${a.role}${a.simulated ? ", demo" : ""})`).join(" + ")}
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <h2>Roles</h2>
            <p className="sub">One quorum, three very different powers.</p>
            <div className="step">
              <span className={`tick ${me.role === "patient" ? "on" : ""}`}>P</span>
              <div>
                <b>Patient</b>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Consent cannot be delegated.</div>
              </div>
            </div>
            <div className="step">
              <span className={`tick ${me.role === "clinician" ? "on" : ""}`}>C</span>
              <div>
                <b>Clinician</b>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Co-signs with clinical need.</div>
              </div>
            </div>
            <div className="step">
              <span className={`tick ${me.role === "admin" ? "on" : ""}`}>A</span>
              <div>
                <b>Administrator</b>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  Can run the realm. Cannot read the record.
                </div>
              </div>
            </div>
            <div className="row">
              <button
                className="btn ghost"
                disabled={busy}
                onClick={async () => {
                  await post("/api/demo/reset");
                  setRecord(null);
                  setGrant(null);
                  setToast({ ok: true, title: "Demo reset", body: "Synthetic data restored." });
                }}
              >
                Reset demo
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="foot">
        CareQuorum · synthetic data only · identity, tokens and approvals verified by TideCloak
        <br />
        Every request is a DPoP-bound token checked server-side; the client is never trusted.
      </div>
    </div>
  );
}

function TopBar({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">CQ</div>
        <div>
          <h1>CareQuorum</h1>
          <span>UNLOCKED · RMIT × Tide</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span className="chip">
          <span className="dot" />
          {name} · {role}
        </span>
        <button className="btn ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}

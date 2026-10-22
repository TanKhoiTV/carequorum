import type { AccessRequest, Role } from "./store";

/**
 * CareQuorum access policy.
 *
 * This is the rule that stops any single party — including a TideCloak
 * realm administrator — from unlocking a patient record on their own.
 *
 * It is evaluated on the server for every read, never in the browser.
 */
export const POLICY = {
  /** Distinct verified identities required before a record unlocks. */
  requiredApprovals: 2,
  /** One approval from each of these roles; roles are bound to Tide identities. */
  requiredRoles: ["patient", "clinician"] as Role[],
  /** Admins are deliberately excluded: god-mode is not an approval. */
  forbiddenRoles: ["admin"] as Role[],
  /** Hard cap on a granted window, whatever the requester asks for. */
  maxMinutes: 15,
  /** A genuine patient consent is mandatory; clinicians cannot consent for them. */
  patientConsentRequired: true,
} as const;

export type PolicyCheck = {
  ok: boolean;
  satisfied: { patient: boolean; clinician: boolean };
  approvals: number;
  required: number;
  problems: string[];
};

export function evaluatePolicy(req: AccessRequest): PolicyCheck {
  const problems: string[] = [];

  // Only distinct identities count. Replaying one login twice does nothing.
  const distinct = new Map<string, Role>();
  for (const a of req.approvals) {
    distinct.set(a.actor.sub, a.actor.role);
  }

  const roles = new Set(distinct.values());
  const satisfied = {
    patient: roles.has("patient"),
    clinician: roles.has("clinician"),
  };

  // Consent is the one thing a simulation can never stand in for.
  const realConsent = req.approvals.some(
    (a) => a.actor.role === "patient" && !a.actor.simulated
  );

  if (distinct.size < POLICY.requiredApprovals) {
    problems.push(
      `${distinct.size} of ${POLICY.requiredApprovals} distinct Tide identities have approved.`
    );
  }
  if (POLICY.patientConsentRequired && !satisfied.patient) {
    problems.push("The patient has not personally consented.");
  }
  if (!satisfied.patient || !realConsent) {
    problems.push("Patient consent must come from the patient's own verified identity — it cannot be simulated or delegated.");
  }
  if (!satisfied.clinician) {
    problems.push("A treating clinician has not co-signed.");
  }
  for (const a of req.approvals) {
    if (POLICY.forbiddenRoles.includes(a.actor.role)) {
      problems.push(
        `${a.actor.name} holds the ${a.actor.role} role; administrators can never approve access.`
      );
    }
  }

  return {
    ok: problems.length === 0,
    satisfied,
    approvals: distinct.size,
    required: POLICY.requiredApprovals,
    problems,
  };
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return POLICY.maxMinutes;
  return Math.max(1, Math.min(Math.trunc(minutes), POLICY.maxMinutes));
}

export type Patient = {
  id: string;
  name: string;
  pronouns: string;
  dob: string;
  mrn: string;
  hospitals: string[];
  records: {
    id: string;
    title: string;
    sensitivity: "standard" | "highly sensitive";
    summary: string;
    fields: { label: string; value: string }[];
  }[];
};

export const PATIENTS: Patient[] = [
  {
    id: "p-maya",
    name: "Maya Okafor",
    pronouns: "she/her",
    dob: "1989-04-12",
    mrn: "MRN-8842-17",
    hospitals: ["St Vincent's Hospital", "Royal Melbourne Hospital"],
    records: [
      {
        id: "rec-mri",
        title: "MRI — lumbar spine + oncology notes",
        sensitivity: "highly sensitive",
        summary:
          "Prior oncology imaging and the treating team's notes. Maya has kept this record under her own consent since her treatment ended.",
        fields: [
          { label: "Study", value: "MRI lumbar spine, 2024-11-03" },
          {
            label: "Impression",
            value:
              "Stable post-treatment appearance. No new metastatic lesion. Mild disc bulge at L4/L5.",
          },
          { label: "Oncology note", value: "Remission confirmed 2025-02. Surveillance every 12 months." },
          { label: "Flagged by patient", value: "Do not share with employer or insurer." },
        ],
      },
    ],
  },
];

export const CURRENT_REQUEST_ID = "req-1042";

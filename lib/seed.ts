// Initial in-memory DB state. Idempotent factory — re-callable to reset.

import type {
  AuthUser,
  LedgerEvent,
  Media,
  Organization,
  User,
  Workflow,
  WorkflowTransition,
} from "./types";

export interface Database {
  organizations: Organization[];
  users: User[];
  workflows: Workflow[];
  workflow_transitions: WorkflowTransition[];
  ledger_events: LedgerEvent[];
  media: Media[];
  export_packs: never[];
  auth_users: AuthUser[];
  // Storage: bucket → path → data URL (base64)
  storage: Record<string, Record<string, string>>;
}

const ORG_ID = "org-nbu-demo";
const now = new Date();

// Stable IDs used by the demo/capture flow.
export const IDS = {
  org: ORG_ID,
  admin: "u-admin",
  inspector: "u-inspector",
  banker: "u-banker",
  supervisor: "u-supervisor",
  proj1: "wf-yashnobod-b4",
  proj2: "wf-chilonzor",
  proj3: "wf-yunusobod",
};

// A known perceptual hash the fraud scenario "replays" — it's planted in the
// known-hash set so the duplicate layer always matches.
export const STOCK_FRAUD_PHASH = "a5a5a5a55a5a5a5a";

export function seedDatabase(): Database {
  const orgs: Organization[] = [
    {
      id: ORG_ID,
      name: "NBU — Demo Bank",
      slug: "nbu-demo",
      product: "tasdiq",
      settings: { demo: true, pilot: "NBU Q2 2026" },
      created_at: iso(-30 * DAY),
    },
  ];

  const auth_users: AuthUser[] = [
    {
      id: IDS.admin,
      email: "admin@tasdiq.uz",
      password: "demo123",
      full_name: "Admin User",
      role: "admin",
      org_id: ORG_ID,
    },
    {
      id: IDS.inspector,
      email: "inspector@tasdiq.uz",
      password: "demo123",
      full_name: "Inspector Ali",
      role: "inspector",
      org_id: ORG_ID,
    },
    {
      id: IDS.banker,
      email: "banker@tasdiq.uz",
      password: "demo123",
      full_name: "Banker Sardor",
      role: "bank_officer",
      org_id: ORG_ID,
    },
    {
      id: IDS.supervisor,
      email: "supervisor@tasdiq.uz",
      password: "demo123",
      full_name: "Supervisor Dilnoza",
      role: "supervisor",
      org_id: ORG_ID,
    },
  ];

  const users: User[] = auth_users.map((u) => ({
    id: u.id,
    org_id: u.org_id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    created_at: iso(-30 * DAY),
  }));

  const workflow_transitions: WorkflowTransition[] = tasdiqTransitions();

  const workflows: Workflow[] = [
    {
      id: IDS.proj1,
      org_id: ORG_ID,
      type: "tranche_verification",
      reference_id: "NBU-2026-Q2-0001",
      reference_label: "Yashnobod Residential, Block 4 — 3rd floor",
      current_state: "EVIDENCE_REQUESTED",
      meta: {
        developer_name: "YashnobodQurilish LLC",
        address: "Yashnobod district, Tashkent",
        coordinates: { lat: 41.2995, lng: 69.2401 },
        geofence_radius_meters: 100,
        milestone_description: "3rd floor frame complete",
        total_tranches: 5,
        current_tranche: 3,
        loan_amount: 8_500_000_000,
        loan_currency: "UZS",
        expected_completion: "2026-05-15",
        challenge_code: "7X4M",
        challenge_issued_at: iso(-1 * HOUR),
      },
      created_by: IDS.admin,
      created_at: iso(-2 * DAY),
      updated_at: iso(-1 * HOUR),
      completed_at: null,
    },
    {
      id: IDS.proj2,
      org_id: ORG_ID,
      type: "tranche_verification",
      reference_id: "NBU-2026-Q1-0088",
      reference_label: "Chilonzor Tower — 7th floor",
      current_state: "APPROVED",
      meta: {
        developer_name: "ChilonzorInvest",
        address: "Chilonzor 15, Tashkent",
        coordinates: { lat: 41.2756, lng: 69.204 },
        geofence_radius_meters: 150,
        milestone_description: "7th floor reinforcement",
        total_tranches: 8,
        current_tranche: 4,
        loan_amount: 14_200_000_000,
        loan_currency: "UZS",
        expected_completion: "2026-07-30",
        challenge_code: "K2PN",
        challenge_issued_at: iso(-6 * DAY),
      },
      created_by: IDS.admin,
      created_at: iso(-10 * DAY),
      updated_at: iso(-5 * DAY),
      completed_at: null,
    },
    {
      id: IDS.proj3,
      org_id: ORG_ID,
      type: "tranche_verification",
      reference_id: "NBU-2026-Q1-0052",
      reference_label: "Yunusobod Business Center — Foundation",
      current_state: "FLAGGED",
      meta: {
        developer_name: "YunusabadDevelopment",
        address: "Amir Temur ave 112, Tashkent",
        coordinates: { lat: 41.3358, lng: 69.2836 },
        geofence_radius_meters: 100,
        milestone_description: "Foundation slab",
        total_tranches: 6,
        current_tranche: 1,
        loan_amount: 6_750_000_000,
        loan_currency: "UZS",
        expected_completion: "2026-06-01",
        challenge_code: "R9QT",
        challenge_issued_at: iso(-4 * DAY),
      },
      created_by: IDS.admin,
      created_at: iso(-7 * DAY),
      updated_at: iso(-4 * DAY),
      completed_at: null,
    },
  ];

  // Ledger genesis — the active project. Hashes are lazy-computed on first write
  // (mock-db writes the first event through the hash chain). For the seed we
  // use pre-computed placeholder hashes that the real chain recomputes on demand.
  const ledger_events: LedgerEvent[] = [];
  const media: Media[] = [];

  return {
    organizations: orgs,
    users,
    workflows,
    workflow_transitions,
    ledger_events,
    media,
    export_packs: [],
    auth_users,
    storage: { evidence: {}, exports: {} },
  };
}

// -------------------------------------------------------------
// Transitions — seeded for tranche_verification per Core spec.
// -------------------------------------------------------------
function tasdiqTransitions(): WorkflowTransition[] {
  const defs: Array<[string, string, string[]]> = [
    ["DRAFT", "EVIDENCE_REQUESTED", ["bank_officer", "admin"]],
    ["EVIDENCE_REQUESTED", "CAPTURED", ["inspector"]],
    ["CAPTURED", "AUTO_VERIFIED", ["admin"]],
    ["CAPTURED", "FLAGGED", ["admin"]],
    ["AUTO_VERIFIED", "APPROVED", ["supervisor", "bank_officer"]],
    ["FLAGGED", "APPROVED", ["supervisor"]],
    ["FLAGGED", "REJECTED", ["supervisor", "bank_officer"]],
    ["APPROVED", "EXPORTED", ["admin", "bank_officer"]],
    ["EXPORTED", "BANK_ACCEPTED", ["bank_officer"]],
    ["EXPORTED", "BANK_REJECTED", ["bank_officer"]],
  ];
  return defs.map(([from, to, roles], i) => ({
    id: `wt-${i}`,
    type: "tranche_verification",
    from_state: from as any,
    to_state: to as any,
    required_role: roles as any,
  }));
}

// -------------------------------------------------------------
// Time helpers
// -------------------------------------------------------------
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function iso(deltaMs: number): string {
  return new Date(now.getTime() + deltaMs).toISOString();
}

// Fake Supabase client.
// Drop-in API shape for supabase-js: .from().select().eq().insert(), .auth.*, .storage.*, .channel().
// Backed by an in-memory store, persisted to localStorage, broadcast across tabs.
//
// Browser-only. On the server this module loads but every method resolves against
// the seed state — pages use "use client" so this never actually executes on the server.

import { seedDatabase, IDS, STOCK_FRAUD_PHASH, type Database } from "./seed";
import { computeEventHash } from "./ledger";
import { publish, bus, Channel } from "./realtime";
import type {
  AuthUser,
  LedgerEvent,
  Media,
  Session,
  User,
  Workflow,
  WorkflowState,
} from "./types";

const LS_KEY = "tasdiq-demo-db-v1";
const SESSION_KEY = "tasdiq-demo-session-v1";

// =============================================================
// State
// =============================================================

let db: Database = seedDatabase();
let session: Session | null = null;
let bootPromise: Promise<void> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function persist() {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

async function boot(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    if (!isBrowser()) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        db = JSON.parse(raw);
      } else {
        db = seedDatabase();
        await writeGenesisLedger();
        persist();
      }
      const sraw = localStorage.getItem(SESSION_KEY);
      if (sraw) session = JSON.parse(sraw);
    } catch {
      db = seedDatabase();
    }
  })();
  return bootPromise;
}

async function writeGenesisLedger() {
  // Seed a small history for the active project so the timeline isn't empty.
  const activeId = IDS.proj1;
  await insertLedger({
    org_id: IDS.org,
    workflow_id: activeId,
    event_type: "workflow_created",
    actor_id: IDS.admin,
    payload: { state: "DRAFT" },
  });
  await insertLedger({
    org_id: IDS.org,
    workflow_id: activeId,
    event_type: "state_changed",
    actor_id: IDS.banker,
    payload: { from: "DRAFT", to: "EVIDENCE_REQUESTED", reason: "Milestone 3 evidence requested" },
  });
  await insertLedger({
    org_id: IDS.org,
    workflow_id: activeId,
    event_type: "challenge_issued",
    actor_id: IDS.admin,
    payload: { code: "7X4M", valid_until: new Date(Date.now() + 10 * 3_600_000).toISOString() },
  });

  // And history for the decorative approved project.
  const p2 = IDS.proj2;
  await insertLedger({
    org_id: IDS.org,
    workflow_id: p2,
    event_type: "workflow_created",
    actor_id: IDS.admin,
    payload: { state: "DRAFT" },
  });
  await insertLedger({
    org_id: IDS.org,
    workflow_id: p2,
    event_type: "state_changed",
    actor_id: IDS.banker,
    payload: { from: "AUTO_VERIFIED", to: "APPROVED", reason: "Milestone 4 approved" },
  });
}

// Reset — wipes localStorage and reseeds. Used by /demo's Reset button.
export async function resetDemoState(): Promise<void> {
  if (isBrowser()) {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  db = seedDatabase();
  session = null;
  bootPromise = null;
  await boot();
  publish({ event: "AUTH_CHANGED" });
}

// =============================================================
// Low-level helpers
// =============================================================

function newId(prefix = "row"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36).slice(-4)}`;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

async function insertLedger(
  event: Omit<LedgerEvent, "id" | "prev_hash" | "hash" | "created_at"> & {
    created_at?: string;
  }
): Promise<LedgerEvent> {
  const id = newId("evt");
  const createdAt = event.created_at ?? new Date().toISOString();
  const prevEvent = db.ledger_events
    .filter((e) => e.org_id === event.org_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const prevHash = prevEvent?.hash ?? null;
  const hash = await computeEventHash({
    prevHash,
    eventId: id,
    eventType: event.event_type,
    payload: event.payload,
    createdAt,
  });
  const row: LedgerEvent = {
    id,
    org_id: event.org_id,
    workflow_id: event.workflow_id,
    event_type: event.event_type,
    actor_id: event.actor_id,
    payload: event.payload,
    prev_hash: prevHash,
    hash,
    created_at: createdAt,
  };
  db.ledger_events.push(row);
  publish({ event: "INSERT", table: "ledger_events", new: clone(row) });
  return row;
}

// Transition a workflow + write the state_changed ledger event.
export async function transitionWorkflow(args: {
  workflowId: string;
  toState: WorkflowState;
  actorId: string;
  reason?: string;
}): Promise<Workflow | null> {
  await boot();
  const wf = db.workflows.find((w) => w.id === args.workflowId);
  if (!wf) return null;
  const from = wf.current_state;
  wf.current_state = args.toState;
  wf.updated_at = new Date().toISOString();
  if (["APPROVED", "REJECTED", "BANK_ACCEPTED", "BANK_REJECTED"].includes(args.toState)) {
    wf.completed_at = wf.updated_at;
  }
  await insertLedger({
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "state_changed",
    actor_id: args.actorId,
    payload: { from, to: args.toState, reason: args.reason ?? null },
  });
  publish({ event: "UPDATE", table: "workflows", new: clone(wf), old: { ...wf, current_state: from } });
  persist();
  return wf;
}

// Exported append-event for callers who need to log a non-transition event.
export async function appendLedgerEvent(
  event: Omit<LedgerEvent, "id" | "prev_hash" | "hash" | "created_at">
): Promise<LedgerEvent> {
  await boot();
  const row = await insertLedger(event);
  persist();
  return row;
}

// =============================================================
// Query builder — supports the subset of supabase-js we actually use.
// =============================================================

type Op = { col: string; op: "eq" | "neq" | "in" | "is"; val: any };

interface Mutation {
  kind: "select" | "insert" | "update" | "delete";
  values?: any;
}

export type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

class QueryBuilder<T = any> implements PromiseLike<Result<T>> {
  private table: string;
  private filters: Op[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private mutation: Mutation = { kind: "select" };
  private returnSelect = false;

  constructor(table: string) {
    this.table = table;
  }

  // SELECT
  select(_cols?: string): this {
    if (this.mutation.kind === "insert" || this.mutation.kind === "update") {
      this.returnSelect = true;
    } else {
      this.mutation = { kind: "select" };
    }
    return this;
  }

  // Filters
  eq(col: string, val: any): this {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  neq(col: string, val: any): this {
    this.filters.push({ col, op: "neq", val });
    return this;
  }
  in(col: string, vals: any[]): this {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  is(col: string, val: any): this {
    this.filters.push({ col, op: "is", val });
    return this;
  }

  // Ordering / limiting / shape
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): QueryBuilder<T extends Array<infer R> ? R : T> {
    this.singleMode = "single";
    return this as unknown as QueryBuilder<T extends Array<infer R> ? R : T>;
  }
  maybeSingle(): QueryBuilder<(T extends Array<infer R> ? R : T) | null> {
    this.singleMode = "maybeSingle";
    return this as unknown as QueryBuilder<(T extends Array<infer R> ? R : T) | null>;
  }

  // Mutations
  insert(values: any): this {
    this.mutation = { kind: "insert", values };
    return this;
  }
  update(values: any): this {
    this.mutation = { kind: "update", values };
    return this;
  }
  delete(): this {
    this.mutation = { kind: "delete" };
    return this;
  }

  // Make it thenable so `await` works.
  then<R1 = Result<T>, R2 = never>(
    onFulfilled?: ((v: Result<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return boot()
      .then(() => this.exec())
      .then(onFulfilled as any, onRejected as any);
  }

  private matches(row: any): boolean {
    for (const f of this.filters) {
      const v = row[f.col];
      if (f.op === "eq" && v !== f.val) return false;
      if (f.op === "neq" && v === f.val) return false;
      if (f.op === "in" && !f.val.includes(v)) return false;
      if (f.op === "is" && v !== f.val) return false;
    }
    return true;
  }

  private async exec(): Promise<Result<T>> {
    const tableKey = this.table as keyof Database;
    const store = (db as any)[tableKey] as any[] | undefined;
    if (!store || !Array.isArray(store)) {
      return { data: null, error: { message: `unknown table: ${this.table}` } };
    }

    if (this.mutation.kind === "insert") {
      return this.execInsert(store);
    }
    if (this.mutation.kind === "update") {
      return this.execUpdate(store);
    }
    if (this.mutation.kind === "delete") {
      return this.execDelete(store);
    }

    // SELECT
    let rows = store.filter((r) => this.matches(r));
    if (this.orderCol) {
      rows = rows.slice().sort((a, b) => {
        const av = a[this.orderCol!];
        const bv = b[this.orderCol!];
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    const cloned = rows.map(clone);
    if (this.singleMode === "single") {
      if (cloned.length === 0) {
        return { data: null, error: { message: "no rows" } };
      }
      return { data: cloned[0] as any, error: null };
    }
    if (this.singleMode === "maybeSingle") {
      return { data: (cloned[0] ?? null) as any, error: null };
    }
    return { data: cloned as any, error: null };
  }

  private async execInsert(store: any[]): Promise<Result<T>> {
    const values = Array.isArray(this.mutation.values)
      ? this.mutation.values
      : [this.mutation.values];
    const inserted: any[] = [];
    for (const raw of values) {
      let row = { ...raw };
      if (!row.id) row.id = newId(this.table.slice(0, 3));
      if (!row.created_at) row.created_at = new Date().toISOString();

      if (this.table === "ledger_events") {
        // Route through the hash-chain helper so prev_hash/hash are correct.
        const { id, prev_hash, hash, created_at, ...rest } = row;
        const persisted = await insertLedger({
          ...(rest as any),
          created_at,
        });
        inserted.push(persisted);
      } else {
        store.push(row);
        inserted.push(row);
        publish({ event: "INSERT", table: this.table, new: clone(row) });
      }
    }
    persist();

    if (!this.returnSelect) return { data: null as any, error: null };
    const cloned = inserted.map(clone);
    if (this.singleMode === "single") return { data: cloned[0] as any, error: null };
    return { data: cloned as any, error: null };
  }

  private async execUpdate(store: any[]): Promise<Result<T>> {
    const updated: any[] = [];
    for (const row of store) {
      if (!this.matches(row)) continue;
      const old = clone(row);
      Object.assign(row, this.mutation.values);
      if (this.table === "workflows") {
        row.updated_at = new Date().toISOString();
      }
      updated.push(clone(row));
      publish({ event: "UPDATE", table: this.table, new: clone(row), old });
    }
    persist();
    if (!this.returnSelect) return { data: null as any, error: null };
    if (this.singleMode === "single") return { data: updated[0] as any, error: null };
    return { data: updated as any, error: null };
  }

  private async execDelete(store: any[]): Promise<Result<T>> {
    const removed: any[] = [];
    for (let i = store.length - 1; i >= 0; i--) {
      if (this.matches(store[i])) {
        const [row] = store.splice(i, 1);
        removed.push(row);
        publish({ event: "DELETE", table: this.table, old: clone(row) });
      }
    }
    persist();
    return { data: removed as any, error: null };
  }
}

// =============================================================
// Auth
// =============================================================

async function signInWithPassword(args: {
  email: string;
  password: string;
}): Promise<Result<{ session: Session; user: Session["user"] }>> {
  await boot();
  const u = db.auth_users.find(
    (x) => x.email.toLowerCase() === args.email.toLowerCase() && x.password === args.password
  );
  if (!u) {
    return { data: null, error: { message: "Invalid email or password" } };
  }
  session = {
    access_token: "mock-token-" + newId("t"),
    expires_at: Date.now() + 24 * 3600 * 1000,
    user: {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      org_id: u.org_id,
    },
  };
  persist();
  publish({ event: "AUTH_CHANGED" });
  return { data: { session, user: session.user }, error: null };
}

async function signOut(): Promise<Result<null>> {
  await boot();
  session = null;
  persist();
  publish({ event: "AUTH_CHANGED" });
  return { data: null, error: null };
}

async function getSession(): Promise<Result<{ session: Session | null }>> {
  await boot();
  return { data: { session }, error: null };
}

async function getUser(): Promise<Result<{ user: Session["user"] | null }>> {
  await boot();
  return { data: { user: session?.user ?? null }, error: null };
}

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
function onAuthStateChange(
  cb: (event: AuthEvent, session: Session | null) => void
): { data: { subscription: { unsubscribe: () => void } } } {
  const ch = bus.channel("auth").on("auth", { event: "*" }, () => {
    cb(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  }).subscribe();
  return {
    data: {
      subscription: {
        unsubscribe: () => bus.removeChannel(ch),
      },
    },
  };
}

// =============================================================
// Storage
// =============================================================

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(
    path: string,
    body: Blob | string
  ): Promise<Result<{ path: string }>> {
    await boot();
    const dataUrl = typeof body === "string" ? body : await blobToDataUrl(body);
    db.storage[this.bucket] ??= {};
    db.storage[this.bucket][path] = dataUrl;
    persist();
    return { data: { path }, error: null };
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const url = db.storage[this.bucket]?.[path] ?? "";
    return { data: { publicUrl: url } };
  }

  async download(path: string): Promise<Result<Blob>> {
    await boot();
    const url = db.storage[this.bucket]?.[path];
    if (!url) return { data: null, error: { message: "not found" } };
    const blob = await (await fetch(url)).blob();
    return { data: blob, error: null };
  }

  async remove(paths: string[]): Promise<Result<null>> {
    await boot();
    db.storage[this.bucket] ??= {};
    for (const p of paths) delete db.storage[this.bucket][p];
    persist();
    return { data: null, error: null };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// =============================================================
// Public client
// =============================================================

export const supabase = {
  from<T = any>(table: string): QueryBuilder<T[]> {
    return new QueryBuilder<T[]>(table);
  },
  auth: {
    signInWithPassword,
    signOut,
    getSession,
    getUser,
    onAuthStateChange,
  },
  storage: {
    from(bucket: string): StorageBucket {
      return new StorageBucket(bucket);
    },
  },
  channel(topic: string): Channel {
    return bus.channel(topic);
  },
  removeChannel(ch: Channel) {
    bus.removeChannel(ch);
  },
};

// Expose a couple of helpers for callers that need atomic operations.
export { IDS, STOCK_FRAUD_PHASH };

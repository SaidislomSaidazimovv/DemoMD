// Hash chain ledger.
// Canonical JSON (sorted keys) + SHA-256 + prev_hash link.
// Uses Web Crypto API so it runs identically in browser and Node 22.

import type { LedgerEvent } from "./types";

// Deterministic JSON — sorted keys at every nesting depth.
// Matters because JSON.stringify key order is insertion order, not canonical.
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") +
    "}"
  );
}

async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeEventHash(args: {
  prevHash: string | null;
  eventId: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}): Promise<string> {
  const data = [
    args.prevHash ?? "GENESIS",
    args.eventId,
    args.eventType,
    canonicalJSON(args.payload),
    args.createdAt,
  ].join("|");
  return sha256Hex(data);
}

// Walks the org's ledger chain and verifies every hash.
//
// Implementation note on timestamps: inserts use `new Date().toISOString()`,
// which always emits `YYYY-MM-DDTHH:mm:ss.sssZ`. Postgres stores the instant
// correctly, but PostgREST may return the same instant formatted as
// `YYYY-MM-DDTHH:mm:ss.sss+00:00` or with microsecond padding. These represent
// the same moment but are different strings — hashing them directly would
// cause every verification to fail. Re-normalize via `new Date(s).toISOString()`
// so we always hash against the same canonical string we wrote.
export async function verifyChain(events: LedgerEvent[]): Promise<{
  valid: boolean;
  brokenAt: string | null;
  anchor: string | null;
}> {
  if (events.length === 0) return { valid: true, brokenAt: null, anchor: null };
  const sorted = events.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  let prev: string | null = null;
  for (const ev of sorted) {
    const normalizedCreatedAt = new Date(ev.created_at).toISOString();
    const expected = await computeEventHash({
      prevHash: prev,
      eventId: ev.id,
      eventType: ev.event_type,
      payload: ev.payload,
      createdAt: normalizedCreatedAt,
    });
    if (ev.hash !== expected || ev.prev_hash !== prev) {
      return { valid: false, brokenAt: ev.id, anchor: null };
    }
    prev = ev.hash;
  }
  return { valid: true, brokenAt: null, anchor: prev };
}

"use client";

// Client-side helpers that wrap fetch() calls to our /api routes.
// Keeps page components free of fetch boilerplate and consolidates error handling.

async function postJson<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.error ?? `Request failed (${r.status})`);
  }
  return data as T;
}

// -------------------------------------------------------------
// Auth
// -------------------------------------------------------------

// NOTE: /signup is done directly via `supabase.auth.signUp()` in the page.
// This goes through Supabase's email-confirmation path and cannot be bypassed by the server.

export async function completeSignup(input: { fullName: string; orgName: string; orgSlug: string }) {
  return postJson<{ ok: true; orgId: string }>("/api/auth/complete-signup", input);
}

import type { UserRole } from "./types";

export interface InviteInput {
  email: string;
  fullName: string;
  role: UserRole;
}
export async function inviteUser(input: InviteInput) {
  return postJson<{ ok: true; userId: string }>("/api/auth/invite", input);
}

// -------------------------------------------------------------
// Workflows / transitions / events
// -------------------------------------------------------------

export async function createWorkflow(input: {
  type: "tranche_verification";
  reference_id: string;
  reference_label: string;
  meta: Record<string, unknown>;
}) {
  return postJson<{ ok: true; workflow: any }>("/api/workflows", input);
}

export async function transitionWorkflow(input: {
  workflow_id: string;
  to_state: string;
  reason?: string;
  system?: boolean;
}) {
  return postJson<{ ok: true; workflow: any }>("/api/transition", input);
}

export async function appendLedgerEvent(input: {
  workflow_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  system?: boolean;
}) {
  return postJson<{ ok: true; event: any }>("/api/events/append", input);
}

// -------------------------------------------------------------
// Challenge code
// -------------------------------------------------------------

export async function issueChallenge(input: { workflow_id: string }) {
  return postJson<{ ok: true; challenge_code: string; challenge_issued_at: string }>(
    "/api/challenge/issue",
    input
  );
}

export async function verifyChallenge(input: {
  workflow_id: string;
  submitted: string;
  captured_at?: string;
}) {
  return postJson<{
    ok: true;
    match: boolean;
    expired: boolean;
    age_seconds: number;
    passed: boolean;
  }>("/api/challenge/verify", input);
}

// -------------------------------------------------------------
// Export (tranche pack)
// -------------------------------------------------------------

export async function generateTranchePack(input: { workflow_id: string }) {
  return postJson<{ ok: true; pack: any; downloadUrl: string | null }>(
    "/api/export",
    input
  );
}

export async function downloadPack(packId: string): Promise<string> {
  const r = await fetch(`/api/export/${packId}/download`, { credentials: "include" });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "download link failed");
  return data.downloadUrl as string;
}

// -------------------------------------------------------------
// Demo helpers — simulate REAL / FRAUD captures
// -------------------------------------------------------------

export async function simulateReal(workflowId: string) {
  return postJson<{ ok: true; media: any; workflow: any }>("/api/demo/simulate-real", { workflowId });
}

export async function simulateFraud(workflowId: string) {
  return postJson<{ ok: true; media: any; workflow: any }>("/api/demo/simulate-fraud", { workflowId });
}

export async function resetDemoProject(workflowId: string) {
  return postJson<{ ok: true; cleared: { media: number; storage_files: number } }>(
    "/api/demo/reset",
    { workflow_id: workflowId }
  );
}

// -------------------------------------------------------------
// Butterfly
// -------------------------------------------------------------

export async function logButterflyCheckin(input: {
  routing_type: "988" | "eap" | "counselor" | "self_resolved" | "declined";
  accepted: boolean;
}) {
  return postJson<{ ok: true }>("/api/butterfly/checkin", input);
}

export async function seedButterflyTraining() {
  return postJson<{ ok: true; created: number; modules: any[] }>(
    "/api/butterfly/training/seed",
    {}
  );
}

export async function generateButterflyReport(input: { quarter?: string } = {}) {
  return postJson<{ ok: true; pack: any; downloadUrl: string | null }>(
    "/api/butterfly/reports/generate",
    input
  );
}

export async function seedButterflyDeploy() {
  return postJson<{ ok: true; workflow: any; created: boolean }>(
    "/api/butterfly/deploy/seed",
    {}
  );
}

// -------------------------------------------------------------
// Org settings
// -------------------------------------------------------------

export async function updateOrgName(input: { name: string }) {
  const r = await fetch("/api/org/update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
  return data as { ok: true; org: any; unchanged?: boolean };
}

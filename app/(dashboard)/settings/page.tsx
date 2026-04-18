"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Mail,
  UserCircle,
  ShieldCheck,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import {
  Card,
  CardContent,
  Button,
  StateBadge,
} from "@/components/ui";
import {
  useTasdiqSession,
  useRequireRoleFromContext,
} from "@/components/app-shell";
import { createClient } from "@/lib/supabase/browser";
import { updateOrgName } from "@/lib/actions";
import type { Organization } from "@/lib/types";

// Tasdiq Settings page.
// Shows: personal account info (read-only), organization info (editable by
// admin), and a Danger Zone with sign-out. Open to every Tasdiq role so
// non-admins can confirm their own identity; edit affordances are hidden
// for non-admins.

export default function SettingsPage() {
  useRequireRoleFromContext([
    "admin",
    "bank_officer",
    "supervisor",
    "inspector",
  ]);
  const session = useTasdiqSession();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"slug" | "userId" | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("organizations")
      .select("*")
      .eq("id", session.profile.org_id)
      .maybeSingle()
      .then(({ data }) => {
        setOrg((data as Organization) ?? null);
        setDraftName(((data as Organization) ?? { name: "" }).name);
        setLoadingOrg(false);
      });
  }, [session.profile.org_id]);

  const isAdmin = session.profile.role === "admin";

  async function saveName() {
    if (!draftName.trim() || !org || draftName.trim() === org.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await updateOrgName({ name: draftName.trim() });
      setOrg(r.org as Organization);
      setEditing(false);
      setNotice("Organization name updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyTo(kind: "slug" | "userId", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // clipboard denied — silently ignore
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="p-6 sm:p-10 max-w-3xl mx-auto space-y-8 fade-up">
      <header>
        <h1 className="text-heading-1 text-ink">Settings</h1>
        <p className="text-body text-ink-tertiary mt-1">
          Your account and the workspace you belong to.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-state-flagged/40 bg-state-flagged-bg px-4 py-3 text-body text-state-flagged">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-state-verified/40 bg-state-verified-bg px-4 py-3 text-body text-state-verified">
          {notice}
        </div>
      )}

      {/* Account */}
      <section>
        <h2 className="text-heading-2 text-ink mb-4">Account</h2>
        <Card>
          <CardContent className="py-5 space-y-4">
            <Row
              icon={<Mail className="text-ink-muted" size={18} />}
              label="Email"
              value={session.email}
              mono
            />
            <Row
              icon={<UserCircle className="text-ink-muted" size={18} />}
              label="Full name"
              value={session.profile.full_name || "—"}
            />
            <Row
              icon={<ShieldCheck className="text-ink-muted" size={18} />}
              label="Role"
              value={
                <StateBadge state={session.profile.role.toUpperCase() as never} />
              }
            />
            <Row
              icon={<UserCircle className="text-ink-muted" size={18} />}
              label="User ID"
              value={
                <button
                  onClick={() => copyTo("userId", session.userId)}
                  className="font-mono text-caption text-ink-secondary hover:text-ink inline-flex items-center gap-2"
                  title="Copy user id"
                >
                  {session.userId.slice(0, 8)}…
                  {copied === "userId" ? (
                    <Check size={12} className="text-state-verified" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              }
            />
          </CardContent>
        </Card>
      </section>

      {/* Organization */}
      <section>
        <h2 className="text-heading-2 text-ink mb-4">Organization</h2>
        {loadingOrg ? (
          <Card>
            <CardContent className="py-5 text-caption text-ink-tertiary">
              Loading…
            </CardContent>
          </Card>
        ) : !org ? (
          <Card>
            <CardContent className="py-5 text-caption text-ink-tertiary">
              Organization not found.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-5 space-y-4">
              {/* Name (editable by admin) */}
              <div className="flex items-start gap-3">
                <Building2 className="text-ink-muted mt-1" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-micro uppercase text-ink-muted">
                    Workspace name
                  </div>
                  {editing ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        maxLength={120}
                        className="flex-1 rounded-md border border-hairline-strong bg-surface-subtle px-3 py-1.5 text-body text-ink focus:outline-none focus:border-accent"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={saveName}
                        disabled={busy || !draftName.trim()}
                        loading={busy}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(false);
                          setDraftName(org.name);
                          setError(null);
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-body text-ink">{org.name}</span>
                      {isAdmin && (
                        <button
                          onClick={() => setEditing(true)}
                          className="text-caption text-state-info hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Slug — always read-only */}
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-ink-muted mt-1" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-micro uppercase text-ink-muted">
                    Workspace slug
                  </div>
                  <button
                    onClick={() => copyTo("slug", org.slug)}
                    className="mt-1 font-mono text-body text-ink inline-flex items-center gap-2 hover:text-ink-secondary"
                    title="Copy slug"
                  >
                    {org.slug}
                    {copied === "slug" ? (
                      <Check size={14} className="text-state-verified" />
                    ) : (
                      <Copy size={14} className="text-ink-muted" />
                    )}
                  </button>
                  <div className="text-caption text-ink-tertiary mt-0.5">
                    Used in URLs and the Storage path prefix. Not editable.
                  </div>
                </div>
              </div>

              {/* Product — read-only indicator */}
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-ink-muted mt-1" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-micro uppercase text-ink-muted">Product</div>
                  <div className="mt-1 inline-flex items-center gap-2">
                    <span className="rounded-full bg-accent/10 text-accent border border-accent/30 px-2.5 py-0.5 text-micro uppercase font-semibold">
                      {org.product}
                    </span>
                    <span className="text-caption text-ink-tertiary">
                      {org.product === "tasdiq"
                        ? "Construction-milestone verification for banks"
                        : "Protocol deployment + compliance for HR"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Created */}
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-ink-muted mt-1" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-micro uppercase text-ink-muted">
                    Created
                  </div>
                  <div className="mt-1 text-body text-ink">
                    {new Date(org.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="text-heading-2 text-ink mb-4">Session</h2>
        <Card>
          <CardContent className="py-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-body text-ink">Sign out of this device</div>
              <div className="text-caption text-ink-tertiary mt-0.5">
                Clears the session locally. Other devices where you&apos;re signed
                in stay signed in.
              </div>
            </div>
            <Button
              variant="secondary"
              leftIcon={<LogOut size={16} />}
              onClick={signOut}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-micro uppercase text-ink-muted">{label}</div>
        <div className={`mt-0.5 text-body text-ink ${mono ? "font-mono" : ""}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

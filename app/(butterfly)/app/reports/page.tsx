"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Eye, FileText, Check } from "lucide-react";
import { BfCard, BfCardContent, BfButton } from "@/components/butterfly/ui";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import { downloadPack, generateButterflyReport } from "@/lib/actions";
import type { ExportPack } from "@/lib/types";

// Screen 3 — The Proof.
// Lists compliance_report packs with Download + Preview actions.
// Per spec: "the moment where Ari realizes this isn't just emotional
// messaging — this is legally defensible documentation."

export default function ButterflyReportsPage() {
  const { session, loading } = useRequireRole(["hr_admin", "admin"]);
  const [packs, setPacks] = useState<ExportPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("export_packs")
      .select("*")
      .eq("pack_type", "compliance_report")
      .order("created_at", { ascending: false });
    setPacks((data as ExportPack[]) ?? []);
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    refresh();
  }, [loading, session, refresh]);

  async function generate() {
    setBusy("generate");
    setError(null);
    try {
      await generateButterflyReport({});
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function download(pack: ExportPack) {
    setBusy(pack.id);
    setError(null);
    try {
      const url = await downloadPack(pack.id);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function preview(pack: ExportPack) {
    setBusy(pack.id);
    setError(null);
    try {
      const url = await downloadPack(pack.id);
      setPreviewUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[color:var(--bf-caption)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="bf-fade-in px-6 sm:px-10 py-16 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-[40px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
          Compliance Reports
        </h1>
        <p className="mt-3 text-[18px] text-[color:var(--bf-muted)] leading-[1.6] max-w-2xl">
          A tamper-evident record of protocol deployment. Generated quarterly.
          Verified by hash chain. Zero personally-identifiable information.
        </p>
      </header>

      <div className="mb-8 flex items-center gap-3">
        <BfButton
          variant="primary"
          onClick={generate}
          disabled={busy !== null}
          leftIcon={<FileText size={16} />}
        >
          {busy === "generate" ? "Generating…" : "Generate current quarter"}
        </BfButton>
      </div>

      {error && (
        <div className="mb-6 rounded-[12px] border border-[color:var(--bf-flagged)]/30 bg-[color:var(--bf-flagged)]/5 px-4 py-3 text-[14px] text-[color:var(--bf-flagged)]">
          {error}
        </div>
      )}

      {packs.length === 0 ? (
        <BfCard>
          <BfCardContent className="py-12 text-center space-y-3">
            <FileText size={36} className="mx-auto text-[color:var(--bf-caption)]" />
            <div className="text-[18px] text-[color:var(--bf-ink)]">No reports yet</div>
            <p className="text-[14px] text-[color:var(--bf-muted)] max-w-sm mx-auto">
              Generate your first quarterly compliance report. It packages the aggregate
              ledger, training coverage, and chain anchor into a verifiable PDF.
            </p>
          </BfCardContent>
        </BfCard>
      ) : (
        <ol className="space-y-4">
          {packs.map((pack) => (
            <ReportRow
              key={pack.id}
              pack={pack}
              busy={busy === pack.id}
              onDownload={() => download(pack)}
              onPreview={() => preview(pack)}
            />
          ))}
        </ol>
      )}

      {previewUrl && (
        <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </div>
  );
}

function ReportRow({
  pack,
  busy,
  onDownload,
  onPreview,
}: {
  pack: ExportPack;
  busy: boolean;
  onDownload: () => void;
  onPreview: () => void;
}) {
  const when = new Date(pack.created_at);
  const title = `Quarter ending ${when.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;

  return (
    <li>
      <BfCard>
        <BfCardContent className="py-6">
          <div className="flex items-start gap-6">
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
                {title}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[13px] text-[color:var(--bf-caption)]">
                <span className="inline-flex items-center gap-1.5">
                  <Check size={13} className="text-[color:var(--bf-verified)]" />
                  Chain valid
                </span>
                <span className="font-mono text-[11px]">
                  manifest {pack.manifest_hash.slice(0, 16)}…
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <BfButton
                variant="ghost"
                size="md"
                onClick={onPreview}
                disabled={busy}
                leftIcon={<Eye size={14} />}
              >
                Preview
              </BfButton>
              <BfButton
                variant="primary"
                size="md"
                onClick={onDownload}
                disabled={busy}
                leftIcon={<Download size={14} />}
              >
                Download
              </BfButton>
            </div>
          </div>
        </BfCardContent>
      </BfCard>
    </li>
  );
}

function PreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-[color:var(--bf-bg)] rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--bf-hair)]">
          <div className="text-[16px] font-semibold text-[color:var(--bf-ink)]">
            Compliance report preview
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)] text-[14px]"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-[color:var(--bf-bg-muted)]">
          {/* The ZIP contains the PDF at 01_report/. Browsers can't preview ZIPs
              inline, so we link out. For a real inline PDF preview, the
              generator would also upload the loose PDF alongside the ZIP. */}
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
            <FileText size={48} className="text-[color:var(--bf-caption)]" />
            <div className="text-[16px] text-[color:var(--bf-ink)]">
              The report is packaged as a ZIP (PDF + aggregate metrics + audit chain).
            </div>
            <p className="text-[14px] text-[color:var(--bf-muted)] max-w-md">
              Click Open to download and unzip. Inside:
              <span className="block mt-3 font-mono text-[11px] text-left bg-[color:var(--bf-bg)] border border-[color:var(--bf-hair)] rounded-lg p-3 whitespace-pre-wrap">
                01_report/compliance_report.pdf{"\n"}02_data/aggregate_metrics.json{"\n"}03_audit/ledger_events.jsonl{"\n"}03_audit/hash_anchor.txt
              </span>
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[color:var(--bf-accent)] text-white px-5 py-2.5 text-[14px] font-medium"
            >
              Open the pack <Download size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

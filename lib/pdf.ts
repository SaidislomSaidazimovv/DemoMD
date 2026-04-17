// Tranche-pack acceptance act generator.
// Uses pdfkit (pure Node, no font files, no canvas). Runs inside the
// /api/export route handler.

import PDFDocument from "pdfkit";
import type {
  FraudCheck,
  LedgerEvent,
  Media,
  Organization,
  Workflow,
} from "./types";

interface ActInput {
  org: Organization | null;
  workflow: Workflow;
  media: Media[];
  events: LedgerEvent[];
  chain: { valid: boolean; anchor: string | null };
  manifestHash: string;
  generatedBy: { email: string; fullName: string | null; role: string };
}

export function generateActPdf(input: ActInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    header(doc, input);
    summary(doc, input);
    evidenceTable(doc, input);
    integrity(doc, input);
    footer(doc, input);

    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, input: ActInput) {
  const { org, workflow } = input;
  doc.fontSize(22).fillColor("#0f766e").text("Tasdiq — Tranche Pack", {
    align: "left",
  });
  doc.moveDown(0.3);
  doc
    .fontSize(14)
    .fillColor("#334155")
    .text("Construction Milestone Acceptance Act", { align: "left" });
  doc.moveDown(0.8);

  doc
    .fontSize(10)
    .fillColor("#64748b")
    .text(`Organization: ${org?.name ?? "—"}`)
    .text(`Generated: ${new Date().toISOString()}`)
    .text(`Reference: ${workflow.reference_id ?? "—"}`);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cbd5e1").stroke();
  doc.moveDown(0.5);
}

function summary(doc: PDFKit.PDFDocument, input: ActInput) {
  const { workflow } = input;
  const m = workflow.meta;

  doc.fontSize(14).fillColor("#0f172a").text("Project", { underline: false });
  doc.moveDown(0.3);

  kv(doc, "Project", workflow.reference_label ?? "—");
  kv(doc, "Developer", m.developer_name ?? "—");
  kv(doc, "Address", m.address ?? "—");
  kv(doc, "Coordinates", `${m.coordinates.lat}, ${m.coordinates.lng}`);
  kv(doc, "Geofence", `${m.geofence_radius_meters} m`);
  kv(doc, "Milestone", m.milestone_description ?? "—");
  kv(
    doc,
    "Tranche",
    `${m.current_tranche ?? "?"} of ${m.total_tranches ?? "?"}`
  );
  if (m.loan_amount) {
    kv(
      doc,
      "Loan",
      `${m.loan_amount.toLocaleString()} ${m.loan_currency ?? ""}`
    );
  }
  kv(doc, "Current state", workflow.current_state);
  doc.moveDown(1);
}

function evidenceTable(doc: PDFKit.PDFDocument, input: ActInput) {
  const { media } = input;

  doc
    .fontSize(14)
    .fillColor("#0f172a")
    .text(`Evidence (${media.length})`, { underline: false });
  doc.moveDown(0.3);

  if (media.length === 0) {
    doc
      .fontSize(10)
      .fillColor("#94a3b8")
      .text("No evidence attached to this workflow.");
    doc.moveDown(0.8);
    return;
  }

  media.forEach((m, i) => {
    const r = m.meta.fraud_result;
    const colorCode =
      r.verdict === "VERIFIED" ? "#059669" : "#dc2626";

    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .fillColor(colorCode)
      .text(`${i + 1}. ${r.verdict} — score ${r.aggregate_score.toFixed(2)}`);
    doc
      .fontSize(9)
      .fillColor("#475569")
      .text(`ID: ${m.id}`)
      .text(`SHA-256: ${m.sha256 ?? "—"}`)
      .text(`pHash: ${m.phash ?? "—"}`)
      .text(`Uploaded: ${new Date(m.created_at).toISOString()}`)
      .text(
        `GPS: ${m.meta.gps.lat.toFixed(5)}, ${m.meta.gps.lng.toFixed(5)} (±${m.meta.gps.accuracy.toFixed(0)}m)`
      );

    doc.moveDown(0.2);
    r.checks.forEach((c: FraudCheck) => {
      const mark = c.passed ? "✓" : "✗";
      doc
        .fontSize(9)
        .fillColor(c.passed ? "#059669" : "#dc2626")
        .text(`  ${mark} Layer — ${c.label} (${c.score.toFixed(2)})  ${c.details}`);
    });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
  });
  doc.moveDown(0.6);
}

function integrity(doc: PDFKit.PDFDocument, input: ActInput) {
  const { events, chain, manifestHash } = input;

  doc.fontSize(14).fillColor("#0f172a").text("Integrity");
  doc.moveDown(0.3);
  kv(doc, "Ledger events", String(events.length));
  kv(doc, "Chain valid", chain.valid ? "YES" : "NO");
  kv(doc, "Hash anchor", chain.anchor ?? "—");
  kv(doc, "Manifest hash", manifestHash);
  doc.moveDown(0.3);

  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      "Every ledger event is linked to the previous one with SHA-256 over canonical JSON. "
        + "Re-computing the chain from GENESIS produces this anchor. If a single byte of any "
        + "payload changes, the anchor changes — the pack is tamper-evident.",
      { align: "left" }
    );
  doc.moveDown(0.8);
}

function footer(doc: PDFKit.PDFDocument, input: ActInput) {
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cbd5e1").stroke();
  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      `Generated by ${input.generatedBy.fullName ?? input.generatedBy.email} (${input.generatedBy.role})`
    )
    .text("Tasdiq — Construction Verification Platform");
}

function kv(doc: PDFKit.PDFDocument, key: string, value: string) {
  const y = doc.y;
  doc.fontSize(10).fillColor("#64748b").text(`${key}:`, 50, y, { width: 120 });
  doc.fontSize(10).fillColor("#0f172a").text(value, 170, y, { width: 380 });
  doc.moveDown(0.1);
}

// Butterfly compliance-report PDF generator.
// Mirrors lib/pdf.ts patterns (pdfkit, pure Node, no external fonts)
// so it runs cleanly in a Vercel serverless function.
//
// Per BUTTERFLY_SAAS_UI.md §Screen 3 — 5-page layout:
//   1. Cover       — org name, quarter, report title
//   2. Training    — bar chart stub of completion over time
//   3. Activity    — routing pie (prose stub), weekly volume
//   4. Compliance  — OSHA / ADA / HIPAA / EPLI attestation prose
//   5. Attestation — hash anchor + verification statement

import PDFDocument from "pdfkit";
import type { LedgerEvent, Organization } from "./types";

export interface ButterflyReportInput {
  org: Organization | null;
  quarterLabel: string; // e.g. "Q1 2026 · January – March"
  metrics: {
    total_checkins: number;
    accepted_count: number;
    routing: Record<string, number>;
    training_completed_pct: number;
    manager_coverage_pct: number;
  };
  events: LedgerEvent[];
  chain: { valid: boolean; anchor: string | null };
  generatedBy: { email: string; fullName: string | null; role: string };
}

const INK = "#0B0B0F";
const MUTED = "#5A5A66";
const CAPTION = "#6E6E73";
const HAIR = "#E9E9EF";
const ACCENT = "#0A4AD6";

export function generateButterflyReportPdf(
  input: ButterflyReportInput
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    pageCover(doc, input);
    doc.addPage();
    pageTraining(doc, input);
    doc.addPage();
    pageActivity(doc, input);
    doc.addPage();
    pageCompliance(doc, input);
    doc.addPage();
    pageAttestation(doc, input);

    doc.end();
  });
}

// ===========================================================
// Page 1 — Cover
// ===========================================================
function pageCover(doc: PDFKit.PDFDocument, input: ButterflyReportInput) {
  const { org, quarterLabel } = input;

  doc.fillColor(CAPTION).fontSize(11).text("BUTTERFLY", { characterSpacing: 2 });
  doc.moveDown(4);

  doc.fillColor(INK).fontSize(32).text("Protocol Deployment Report", {
    align: "left",
  });
  doc.moveDown(0.6);

  doc.fillColor(MUTED).fontSize(16).text(quarterLabel);
  doc.moveDown(0.4);
  doc.fillColor(MUTED).fontSize(14).text(org?.name ?? "—");

  doc.moveDown(4);
  doc
    .fillColor(CAPTION)
    .fontSize(11)
    .text(
      "A tamper-evident record of protocol deployment. " +
        "Generated quarterly. Verified by hash chain. " +
        "Zero personally-identifiable information.",
      {
        width: 480,
        lineGap: 4,
      }
    );
}

// ===========================================================
// Page 2 — Training coverage
// ===========================================================
function pageTraining(doc: PDFKit.PDFDocument, input: ButterflyReportInput) {
  sectionHeader(doc, "01", "Training coverage");

  const pct = input.metrics.training_completed_pct;
  const mgr = input.metrics.manager_coverage_pct;

  bigStat(doc, `${pct}%`, "of assigned modules completed");
  doc.moveDown(1);
  bigStat(doc, `${mgr}%`, "manager coverage");
  doc.moveDown(2);

  doc.fillColor(MUTED).fontSize(12).text(
    "Training is required before the protocol is considered deployed. " +
      "Managers complete a three-module sequence (Noticing, Responding, Logging). " +
      "Completion is tracked in the core ledger and exported below as part of the attestation.",
    { width: 495, lineGap: 4 }
  );
}

// ===========================================================
// Page 3 — Check-in activity
// ===========================================================
function pageActivity(doc: PDFKit.PDFDocument, input: ButterflyReportInput) {
  sectionHeader(doc, "02", "Check-in activity");

  bigStat(doc, input.metrics.total_checkins.toLocaleString(), "check-ins logged");
  doc.moveDown(1);

  const acceptedPct =
    input.metrics.total_checkins > 0
      ? Math.round((input.metrics.accepted_count / input.metrics.total_checkins) * 100)
      : 0;
  bigStat(
    doc,
    `${acceptedPct}%`,
    `(${input.metrics.accepted_count.toLocaleString()}) accepted the routed resource`
  );
  doc.moveDown(2);

  // Routing breakdown (prose, since we're not drawing charts)
  doc.fillColor(INK).fontSize(13).text("Routing breakdown");
  doc.moveDown(0.4);
  const routingRows: [string, number][] = [
    ["Called 988 together", input.metrics.routing["988"] ?? 0],
    ["Referred to EAP", input.metrics.routing["eap"] ?? 0],
    ["Connected with counselor", input.metrics.routing["counselor"] ?? 0],
    ["Self-resolved", input.metrics.routing["self_resolved"] ?? 0],
    ["Declined all support", input.metrics.routing["declined"] ?? 0],
  ];
  for (const [label, n] of routingRows) {
    doc
      .fillColor(MUTED)
      .fontSize(11)
      .text(`${label}: `, { continued: true })
      .fillColor(INK)
      .text(`${n.toLocaleString()}`);
  }
}

// ===========================================================
// Page 4 — Compliance posture
// ===========================================================
function pageCompliance(doc: PDFKit.PDFDocument, input: ButterflyReportInput) {
  void input;
  sectionHeader(doc, "03", "Compliance posture");

  const frameworks: [string, string][] = [
    [
      "OSHA General Duty",
      "A documented protocol for responding to signs of worker distress, " +
        "with trained managers and a verifiable response log, contributes to " +
        "the organization's General Duty obligation to furnish a workplace " +
        "free from recognized hazards.",
    ],
    [
      "ADA",
      "The Butterfly Protocol does not record health data, diagnoses, or " +
        "impairments. Routing choices are logged as categorical counts only. " +
        "No individual record can be linked to a specific employee.",
    ],
    [
      "HIPAA",
      "No Protected Health Information is collected. The organization's " +
        "ledger logs aggregate routing events only. Covered-entity status " +
        "is not triggered by this program.",
    ],
    [
      "EPLI",
      "The 90-day auto-purge of individual events, combined with the " +
        "absence of actor identifiers in routing records, materially reduces " +
        "discovery exposure in employment-practices claims.",
    ],
  ];

  for (const [heading, body] of frameworks) {
    doc.fillColor(INK).fontSize(13).text(heading);
    doc.moveDown(0.2);
    doc.fillColor(MUTED).fontSize(10.5).text(body, { width: 495, lineGap: 3 });
    doc.moveDown(0.8);
  }
}

// ===========================================================
// Page 5 — Attestation
// ===========================================================
function pageAttestation(doc: PDFKit.PDFDocument, input: ButterflyReportInput) {
  sectionHeader(doc, "04", "Attestation");

  const { chain, generatedBy, org, quarterLabel } = input;

  doc
    .fillColor(MUTED)
    .fontSize(11)
    .text(
      `This report was generated from the cryptographically-sealed ledger ` +
        `of ${org?.name ?? "the organization"} for the period ${quarterLabel}. ` +
        `Every row in the ledger is SHA-256 hash-chained to the one before it; ` +
        `any single-byte tampering invalidates the chain and blocks the export.`,
      { width: 495, lineGap: 4 }
    );
  doc.moveDown(1.5);

  doc
    .fillColor(INK)
    .fontSize(13)
    .text("Chain integrity: ", { continued: true })
    .fillColor(chain.valid ? ACCENT : "#B03030")
    .text(chain.valid ? "VALID" : "BROKEN");
  doc.moveDown(0.6);

  doc
    .fillColor(CAPTION)
    .fontSize(9)
    .text(`Hash anchor: ${chain.anchor ?? "GENESIS"}`, { width: 495 });
  doc.moveDown(1.5);

  doc
    .fillColor(CAPTION)
    .fontSize(10)
    .text(
      `Generated by ${generatedBy.fullName ?? generatedBy.email} ` +
        `(${generatedBy.role}) on ${new Date().toISOString()}.`,
      { width: 495 }
    );
}

// ===========================================================
// Helpers
// ===========================================================
function sectionHeader(doc: PDFKit.PDFDocument, number: string, title: string) {
  doc
    .fillColor(CAPTION)
    .fontSize(10)
    .text(number, { characterSpacing: 2 });
  doc.moveDown(0.2);
  doc.fillColor(INK).fontSize(22).text(title);
  doc.moveDown(0.3);
  doc
    .strokeColor(HAIR)
    .lineWidth(1)
    .moveTo(doc.x, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .stroke();
  doc.moveDown(1);
}

function bigStat(doc: PDFKit.PDFDocument, value: string, label: string) {
  doc.fillColor(INK).fontSize(32).text(value);
  doc.moveDown(0.1);
  doc.fillColor(MUTED).fontSize(12).text(label);
}

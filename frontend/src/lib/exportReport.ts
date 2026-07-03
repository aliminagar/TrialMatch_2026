/**
 * Client-side export of a match report to JSON or a formatted PDF.
 *
 * The content model (`buildReportLines`) and serializers are pure and unit-
 * tested; the `download*` helpers are thin DOM/jsPDF wrappers used in the app.
 */

import type { LlmStats, MatchReport, PatientProfile } from "./types";
import { verdictCounts } from "./types";

export type PdfLineKind =
  | "title"
  | "subtitle"
  | "section"
  | "trial"
  | "label"
  | "body"
  | "muted"
  | "quote"
  | "divider";

export interface PdfLine {
  kind: PdfLineKind;
  text: string;
}

function patientLines(p: PatientProfile): PdfLine[] {
  const lines: PdfLine[] = [{ kind: "section", text: "Patient profile" }];
  lines.push({ kind: "body", text: `Age / sex: ${p.age} · ${p.sex}` });
  lines.push({
    kind: "body",
    text: `Primary diagnosis: ${p.primary_diagnosis.description ?? "—"} (${p.primary_diagnosis.icd10})`,
  });
  if (p.ecog_performance_status !== null && p.ecog_performance_status !== undefined) {
    lines.push({ kind: "body", text: `ECOG performance status: ${p.ecog_performance_status}` });
  }
  if (p.current_medications.length) {
    lines.push({ kind: "body", text: `Medications: ${p.current_medications.join(", ")}` });
  }
  if (p.prior_treatments.length) {
    lines.push({ kind: "body", text: `Prior treatments: ${p.prior_treatments.join(", ")}` });
  }
  if (p.comorbidities.length) {
    const c = p.comorbidities.map((d) => d.description ?? d.icd10).join(", ");
    lines.push({ kind: "body", text: `Comorbidities: ${c}` });
  }
  const labKeys = Object.keys(p.lab_values);
  if (labKeys.length) {
    for (const k of labKeys) {
      const lv = p.lab_values[k];
      const ref = lv.reference_range ? ` (ref ${lv.reference_range})` : "";
      lines.push({ kind: "muted", text: `Lab · ${k}: ${lv.value} ${lv.unit}${ref}` });
    }
  }
  if (p.geographic_constraint) {
    const g = p.geographic_constraint;
    const loc = [g.city, g.state, g.country].filter(Boolean).join(", ");
    lines.push({ kind: "body", text: `Location: ${loc}` });
  }
  return lines;
}

function statsLines(stats: LlmStats): PdfLine[] {
  return [
    { kind: "section", text: "Claude evaluation" },
    { kind: "body", text: `Model: ${stats.model}` },
    {
      kind: "muted",
      text: `${stats.api_calls} API call(s) · ${stats.input_tokens.toLocaleString("en-US")} in / ${stats.output_tokens.toLocaleString("en-US")} out tokens · $${stats.cost_usd.toFixed(4)} · ${stats.latency_s.toFixed(1)}s`,
    },
  ];
}

/** The full report as an ordered list of styled lines (pure, testable). */
export function buildReportLines(report: MatchReport): PdfLine[] {
  const lines: PdfLine[] = [
    { kind: "title", text: "TrialMatch AI — Match Report" },
    { kind: "muted", text: `Generated ${report.generated_at}` },
    { kind: "divider", text: "" },
    ...patientLines(report.patient),
    { kind: "divider", text: "" },
    { kind: "section", text: `Results (${report.trial_verdicts.length} trials)` },
    { kind: "body", text: report.summary },
  ];

  for (const trial of report.trial_verdicts) {
    const c = verdictCounts(trial);
    lines.push({ kind: "divider", text: "" });
    lines.push({
      kind: "trial",
      text: `${trial.nct_id} — ${trial.aggregate_verdict.replace(/_/g, " ")} · score ${trial.score.toFixed(2)}`,
    });
    lines.push({ kind: "body", text: trial.title });
    lines.push({
      kind: "muted",
      text: `${c.PASS} pass · ${c.FAIL} fail · ${c.INSUFFICIENT_INFO} insufficient (${trial.criteria_verdicts.length} criteria)`,
    });
    for (const cv of trial.criteria_verdicts) {
      lines.push({
        kind: "label",
        text: `[${cv.verdict}] ${cv.criterion.criterion_type} · ${cv.criterion.category.replace(/_/g, " ")} (confidence ${cv.confidence.toFixed(2)})`,
      });
      lines.push({ kind: "body", text: cv.reasoning });
      lines.push({ kind: "quote", text: `“${cv.source_citation}”` });
    }
  }

  if (report.llm_stats) {
    lines.push({ kind: "divider", text: "" });
    lines.push(...statsLines(report.llm_stats));
  }

  lines.push({ kind: "divider", text: "" });
  lines.push({ kind: "muted", text: report.disclaimer });
  return lines;
}

/** Pretty-printed JSON of the full report. */
export function serializeReportJson(report: MatchReport): string {
  return JSON.stringify(report, null, 2);
}

/** Stable file base name, e.g. "trialmatch-report-2026-07-03". */
export function reportFileBase(report: MatchReport): string {
  const date = (report.generated_at ?? "").slice(0, 10) || "export";
  return `trialmatch-report-${date}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadReportJson(report: MatchReport): void {
  const blob = new Blob([serializeReportJson(report)], { type: "application/json" });
  triggerDownload(blob, `${reportFileBase(report)}.json`);
}

const KIND_STYLE: Record<
  PdfLineKind,
  { size: number; style: "normal" | "bold" | "italic"; gapBefore: number; color?: [number, number, number] }
> = {
  title: { size: 18, style: "bold", gapBefore: 0 },
  subtitle: { size: 12, style: "normal", gapBefore: 2 },
  section: { size: 13, style: "bold", gapBefore: 6 },
  trial: { size: 12, style: "bold", gapBefore: 4, color: [13, 148, 136] },
  label: { size: 9.5, style: "bold", gapBefore: 3 },
  body: { size: 10, style: "normal", gapBefore: 1 },
  muted: { size: 9, style: "normal", gapBefore: 1, color: [120, 113, 108] },
  quote: { size: 9, style: "italic", gapBefore: 1, color: [87, 83, 78] },
  divider: { size: 6, style: "normal", gapBefore: 3 },
};

export async function downloadReportPdf(report: MatchReport): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  for (const line of buildReportLines(report)) {
    const s = KIND_STYLE[line.kind];
    y += s.gapBefore;
    if (line.kind === "divider") {
      doc.setDrawColor(230, 228, 224);
      doc.line(margin, y, pageWidth - margin, y);
      y += s.gapBefore;
      continue;
    }
    doc.setFont("helvetica", s.style);
    doc.setFontSize(s.size);
    doc.setTextColor(...(s.color ?? [28, 25, 23]));
    const wrapped = doc.splitTextToSize(line.text, maxWidth) as string[];
    for (const row of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(row, margin, y);
      y += s.size * 1.25;
    }
  }

  doc.save(`${reportFileBase(report)}.pdf`);
}

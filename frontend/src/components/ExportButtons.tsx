"use client";

import { Download, FileJson, Loader2 } from "lucide-react";
import { useState } from "react";

import { downloadReportJson, downloadReportPdf } from "@/lib/exportReport";
import type { MatchReport } from "@/lib/types";

export function ExportButtons({ report }: { report: MatchReport }) {
  const [busy, setBusy] = useState(false);

  async function handlePdf() {
    setBusy(true);
    try {
      await downloadReportPdf(report);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePdf}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-gradient-to-br from-accent-strong to-secondary-strong px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <Download size={13} aria-hidden />
        )}
        Download report
      </button>
      <button
        type="button"
        onClick={() => downloadReportJson(report)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        <FileJson size={13} aria-hidden />
        JSON
      </button>
    </div>
  );
}

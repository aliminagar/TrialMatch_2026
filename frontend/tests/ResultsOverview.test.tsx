import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultsOverview } from "@/components/ResultsOverview";

import { sampleReport } from "./fixtures";

afterEach(cleanup);

/**
 * Smoke test for the chart-heavy overview: it renders recharts (donut, bars),
 * count-ups, the confidence bar, and the stats chip without crashing — the one
 * runtime surface the pure-logic tests don't cover.
 */
describe("ResultsOverview", () => {
  it("renders the headline, summary, and Claude stats without throwing", () => {
    render(<ResultsOverview report={sampleReport} />);

    expect(screen.getByRole("region", { name: /results overview/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /evaluated/i })).toBeInTheDocument();
    expect(screen.getByText(sampleReport.summary)).toBeInTheDocument();
    expect(screen.getByText(/Powered by Claude/i)).toBeInTheDocument();
    // top-candidate callout surfaces the trial
    expect(screen.getByText(sampleReport.trial_verdicts[0].title)).toBeInTheDocument();
  });
});

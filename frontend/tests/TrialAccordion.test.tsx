import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrialAccordion } from "@/components/TrialAccordion";

import { sampleTrialVerdict } from "./fixtures";

afterEach(cleanup);

describe("TrialAccordion", () => {
  it("shows the header but hides the criteria table when collapsed", () => {
    render(<TrialAccordion trial={sampleTrialVerdict} defaultOpen={false} />);

    // header content is always visible
    expect(screen.getByText(sampleTrialVerdict.title)).toBeInTheDocument();
    // the toggle reports collapsed
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    // criteria are not rendered while collapsed
    expect(screen.queryByText(/ECOG performance status 0 to 1/i)).not.toBeInTheDocument();
  });

  it("expands to reveal the criteria table on click", () => {
    render(<TrialAccordion trial={sampleTrialVerdict} defaultOpen={false} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText(/ECOG performance status 0 to 1/i)).toBeInTheDocument();
  });

  it("renders expanded when defaultOpen is set (top-ranked trial)", () => {
    render(<TrialAccordion trial={sampleTrialVerdict} defaultOpen />);

    expect(screen.getByText(/ECOG performance status 0 to 1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });
});

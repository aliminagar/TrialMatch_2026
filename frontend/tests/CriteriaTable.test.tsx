import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CriteriaTable } from "@/components/CriteriaTable";

import { sampleTrialVerdict } from "./fixtures";

afterEach(cleanup);

const criteria = sampleTrialVerdict.criteria_verdicts;

describe("CriteriaTable", () => {
  it("renders a row per criterion with its verdict and text", () => {
    render(<CriteriaTable criteria={criteria} />);

    // one data row per criterion (grounded rows are collapsed by default)
    expect(
      screen.getByText(/Have histologically confirmed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ECOG performance status 0 to 1/i)).toBeInTheDocument();
    expect(screen.getByText(/inflammatory or metaplastic/i)).toBeInTheDocument();

    // verdict badges present inside the table (PASS once, INSUFFICIENT twice);
    // scoped to the table so the "Pass" filter tab isn't counted.
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Pass")).toHaveLength(1);
    expect(within(table).getAllByText("Insufficient info")).toHaveLength(2);
  });

  it("filters to a single verdict via the tabs", () => {
    render(<CriteriaTable criteria={criteria} />);

    const passTab = screen.getByRole("tab", { name: /Pass/i });
    fireEvent.click(passTab);

    expect(screen.getByText(/ECOG performance status 0 to 1/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Have histologically confirmed/i),
    ).not.toBeInTheDocument();
  });

  it("searches across criterion text", () => {
    render(<CriteriaTable criteria={criteria} />);

    fireEvent.change(screen.getByRole("searchbox", { name: /search criteria/i }), {
      target: { value: "inflammatory" },
    });

    expect(screen.getByText(/inflammatory or metaplastic/i)).toBeInTheDocument();
    expect(screen.queryByText(/ECOG performance status/i)).not.toBeInTheDocument();
  });

  it("reveals the grounded citation when a row is expanded", () => {
    render(<CriteriaTable criteria={criteria} />);

    const [firstToggle] = screen.getAllByRole("button", {
      name: /expand criterion detail/i,
    });
    fireEvent.click(firstToggle);

    const quote = screen.getByText(/Grounded in the trial's own words/i);
    expect(quote).toBeInTheDocument();
    // the blockquote renders the verbatim citation
    const figure = quote.closest("figure");
    expect(within(figure as HTMLElement).getByText(criteria[0].source_citation, { exact: false })).toBeInTheDocument();
  });
});

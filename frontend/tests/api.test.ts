import { describe, expect, it } from "vitest";

import { ALL_TRIALS, buildMatchRequest } from "@/lib/api";
import { SAMPLE_PATIENT } from "@/lib/sample";

describe("buildMatchRequest", () => {
  it("defaults to the top 5 trials", () => {
    const req = buildMatchRequest(SAMPLE_PATIENT);
    expect(req.input_mode).toBe("structured");
    expect(req.patient).toBe(SAMPLE_PATIENT);
    expect(req.options?.max_results).toBe(5);
  });

  it("passes an explicit max_results through", () => {
    expect(buildMatchRequest(SAMPLE_PATIENT, 3).options?.max_results).toBe(3);
    expect(buildMatchRequest(SAMPLE_PATIENT, 10).options?.max_results).toBe(10);
  });

  it("maps the 'All' choice to the backend maximum (50)", () => {
    expect(ALL_TRIALS).toBe(50);
    expect(buildMatchRequest(SAMPLE_PATIENT, ALL_TRIALS).options?.max_results).toBe(50);
  });
});

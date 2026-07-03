import { describe, expect, it } from "vitest";

import {
  initialMatchState,
  matchReducer,
  type MatchState,
} from "@/lib/matchReducer";
import type { StreamEvent } from "@/lib/types";

import { sampleReport } from "./fixtures";

function sse(state: MatchState, event: StreamEvent, ts = 0): MatchState {
  return matchReducer(state, { type: "sse", event, ts });
}

describe("matchReducer", () => {
  it("has an idle initial state with all nodes pending", () => {
    const s = initialMatchState();
    expect(s.status).toBe("idle");
    expect(Object.values(s.nodeStates).every((v) => v === "pending")).toBe(true);
    expect(s.result).toBeNull();
    expect(s.error).toBeNull();
  });

  it("start activates the first node and logs", () => {
    const s = matchReducer(initialMatchState(), { type: "start", ts: 1 });
    expect(s.status).toBe("running");
    expect(s.nodeStates.profile_extractor).toBe("active");
    expect(s.nodeStates.trial_discovery).toBe("pending");
    expect(s.activityLog).toHaveLength(1);
  });

  it("advances the stepper as nodes complete (derived active cursor)", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = sse(s, { event: "state_update", node: "profile_extractor", status: "completed" });
    expect(s.nodeStates.profile_extractor).toBe("complete");
    expect(s.nodeStates.trial_discovery).toBe("active");

    s = sse(s, { event: "state_update", node: "trial_discovery", status: "completed" });
    expect(s.nodeStates.trial_discovery).toBe("complete");
    expect(s.nodeStates.eligibility_parser).toBe("active");
  });

  it("ignores state_update for unknown node names", () => {
    const start = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    const s = sse(start, { event: "state_update", node: "mystery_node", status: "completed" });
    expect(s).toEqual(start);
  });

  it("final_result marks every node complete, sets result, and finishes", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = sse(s, { event: "final_result", report: sampleReport });
    expect(s.status).toBe("done");
    expect(Object.values(s.nodeStates).every((v) => v === "complete")).toBe(true);
    expect(s.result).toBe(sampleReport);
    // summary line + per-criterion count line
    const texts = s.activityLog.map((l) => l.text);
    expect(texts.some((t) => t.includes("NEEDS REVIEW"))).toBe(true);
    expect(texts.some((t) => t.includes("pass") && t.includes("fail"))).toBe(true);
  });

  it("an error event transitions to error and records the code/message", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = sse(s, { event: "error", code: "internal_error", message: "boom" });
    expect(s.status).toBe("error");
    expect(s.error).toEqual({ code: "internal_error", message: "boom" });
    expect(s.activityLog.at(-1)?.tone).toBe("error");
  });

  it("a stream interruption (network) sets error state", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = matchReducer(s, {
      type: "streamError",
      code: "stream_interrupted",
      message: "Connection lost mid-run",
      ts: 5,
    });
    expect(s.status).toBe("error");
    expect(s.error?.code).toBe("stream_interrupted");
  });

  it("a failed node marks that node failed and errors the run", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = sse(s, {
      event: "state_update",
      node: "trial_discovery",
      status: "failed",
      message: "ClinicalTrials.gov unreachable",
    });
    expect(s.nodeStates.trial_discovery).toBe("failed");
    expect(s.status).toBe("error");
    expect(s.error?.message).toContain("unreachable");
  });

  it("reset returns to the initial state", () => {
    let s = matchReducer(initialMatchState(), { type: "start", ts: 0 });
    s = sse(s, { event: "final_result", report: sampleReport });
    expect(matchReducer(s, { type: "reset" })).toEqual(initialMatchState());
  });
});

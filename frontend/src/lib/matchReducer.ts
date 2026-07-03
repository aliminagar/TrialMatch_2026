/**
 * Pure, unit-testable reducer for a live match run.
 *
 * All SSE-driven UI state (pipeline stepper, activity feed, result, error)
 * derives from this one reducer: stream events in -> immutable state out. It is
 * deliberately free of side effects and clocks — callers pass a timestamp on
 * each action so tests stay deterministic.
 *
 * Contract note: the backend emits exactly one `state_update` with
 * status="completed" per graph node (see api/routes/match.py `_event_stream`) —
 * there are no "started" frames and no per-criterion progress. The stepper's
 * "active" state is therefore *derived*: completing node N advances the cursor
 * to N+1. We never fabricate progress the backend didn't send.
 */

import {
  NODE_LABELS,
  PIPELINE_NODES,
  isPipelineNode,
  verdictCounts,
  type MatchReport,
  type PipelineNode,
  type StreamEvent,
} from "./types";

export type StepStatus = "pending" | "active" | "complete" | "failed";
export type RunStatus = "idle" | "running" | "clarifying" | "done" | "error";
export type ActivityTone = "info" | "success" | "error";

export interface ActivityLine {
  id: number;
  ts: number;
  text: string;
  tone: ActivityTone;
}

export interface MatchState {
  status: RunStatus;
  nodeStates: Record<PipelineNode, StepStatus>;
  activityLog: ActivityLine[];
  result: MatchReport | null;
  error: { code: string; message: string } | null;
}

export type MatchAction =
  | { type: "start"; ts: number }
  | { type: "reset" }
  | { type: "sse"; event: StreamEvent; ts: number }
  | { type: "streamError"; code: string; message: string; ts: number };

function pendingNodes(): Record<PipelineNode, StepStatus> {
  return PIPELINE_NODES.reduce(
    (acc, node) => {
      acc[node] = "pending";
      return acc;
    },
    {} as Record<PipelineNode, StepStatus>,
  );
}

export function initialMatchState(): MatchState {
  return {
    status: "idle",
    nodeStates: pendingNodes(),
    activityLog: [],
    result: null,
    error: null,
  };
}

function log(
  state: MatchState,
  ts: number,
  text: string,
  tone: ActivityTone,
): ActivityLine[] {
  return [...state.activityLog, { id: state.activityLog.length, ts, text, tone }];
}

/** Mark `node` complete and advance the cursor to the next pending node. */
function advance(
  nodeStates: Record<PipelineNode, StepStatus>,
  node: PipelineNode,
): Record<PipelineNode, StepStatus> {
  const next = { ...nodeStates, [node]: "complete" as StepStatus };
  const idx = PIPELINE_NODES.indexOf(node);
  const following = PIPELINE_NODES[idx + 1];
  if (following && next[following] === "pending") next[following] = "active";
  return next;
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case "reset":
      return initialMatchState();

    case "start": {
      const nodeStates = pendingNodes();
      nodeStates[PIPELINE_NODES[0]] = "active";
      const base: MatchState = { ...initialMatchState(), status: "running", nodeStates };
      return { ...base, activityLog: log(base, action.ts, "Match run started", "info") };
    }

    case "streamError":
      return {
        ...state,
        status: "error",
        error: { code: action.code, message: action.message },
        activityLog: log(state, action.ts, action.message, "error"),
      };

    case "sse":
      return applyStreamEvent(state, action.event, action.ts);

    default:
      return state;
  }
}

function applyStreamEvent(state: MatchState, event: StreamEvent, ts: number): MatchState {
  switch (event.event) {
    case "state_update": {
      if (!isPipelineNode(event.node)) return state; // ignore unknown nodes
      const label = NODE_LABELS[event.node];
      if (event.status === "failed") {
        return {
          ...state,
          status: "error",
          nodeStates: { ...state.nodeStates, [event.node]: "failed" },
          error: { code: "node_failed", message: event.message ?? `${label} failed` },
          activityLog: log(state, ts, event.message ?? `${label} failed`, "error"),
        };
      }
      if (event.status === "started") {
        return {
          ...state,
          nodeStates: { ...state.nodeStates, [event.node]: "active" },
          activityLog: log(state, ts, `${label}…`, "info"),
        };
      }
      // completed
      return {
        ...state,
        nodeStates: advance(state.nodeStates, event.node),
        activityLog: log(state, ts, `${label} complete`, "success"),
      };
    }

    case "final_result": {
      const nodeStates = { ...state.nodeStates };
      for (const node of PIPELINE_NODES) nodeStates[node] = "complete";
      const report = event.report;
      const trial = report.trial_verdicts[0];
      const summaryLine = trial
        ? `${report.trial_verdicts.length} trial(s) evaluated — ${trial.aggregate_verdict.replace(/_/g, " ")}`
        : "No matching trials found";
      let activityLog = log(state, ts, summaryLine, "success");
      if (trial) {
        const c = verdictCounts(trial);
        activityLog = [
          ...activityLog,
          {
            id: activityLog.length,
            ts,
            text: `${trial.criteria_verdicts.length} criteria — ${c.PASS} pass · ${c.FAIL} fail · ${c.INSUFFICIENT_INFO} insufficient`,
            tone: "info",
          },
        ];
      }
      return { ...state, status: "done", nodeStates, result: report, activityLog };
    }

    case "error":
      return {
        ...state,
        status: "error",
        error: { code: event.code, message: event.message },
        activityLog: log(state, ts, event.message, "error"),
      };

    case "clarification_required":
      return {
        ...state,
        status: "clarifying",
        activityLog: log(state, ts, "Clarification required to continue", "info"),
      };

    default:
      return state;
  }
}

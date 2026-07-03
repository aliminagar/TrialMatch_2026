"use client";

import { useCallback, useReducer, useRef } from "react";

import { describeError, streamMatch } from "@/lib/api";
import { initialMatchState, matchReducer } from "@/lib/matchReducer";
import type { PatientProfile } from "@/lib/types";

/**
 * Drives a live match run: owns the reducer, the fetch AbortController, and the
 * SSE consumption loop. The reducer stays pure; this hook is the only place
 * with side effects (network, clock, abort).
 */
export function useMatchRun() {
  const [state, dispatch] = useReducer(matchReducer, undefined, initialMatchState);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (patient: PatientProfile, maxResults: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: "start", ts: Date.now() });

    try {
      for await (const event of streamMatch(patient, maxResults, ctrl.signal)) {
        dispatch({ type: "sse", event, ts: Date.now() });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return; // user cancelled — handled by cancel()
      dispatch({
        type: "streamError",
        code: "stream_interrupted",
        message: describeError(err),
        ts: Date.now(),
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  return {
    state,
    run,
    cancel,
    reset,
    running: state.status === "running",
  };
}

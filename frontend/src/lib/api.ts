/**
 * Browser API client for the TrialMatch backend.
 *
 * The FastAPI service is called directly from the browser (CORS is enabled for
 * the web origin), configured via NEXT_PUBLIC_API_URL. `streamMatch` runs the
 * match as an SSE stream over POST — consumed with fetch + a ReadableStream
 * reader (NOT EventSource, which is GET-only) and parsed by the tested frame
 * parser in ./sse.
 */

import { decodeStreamEvent, parseSseFrames } from "./sse";
import type { MatchRequest, PatientProfile, StreamEvent, TrialDetail } from "./types";

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export function trialUrl(nctId: string): string {
  return `https://clinicaltrials.gov/study/${nctId}`;
}

/** "All" maps to the backend's max (le=50); discovery caps the actual fetch. */
export const ALL_TRIALS = 50;

/** Turn a validated patient into the structured MatchRequest body. */
export function buildMatchRequest(
  patient: PatientProfile,
  maxResults = 5,
): MatchRequest {
  return { input_mode: "structured", patient, options: { max_results: maxResults } };
}

/** Human-friendly message for a network/stream failure. */
export function describeError(err: unknown): string {
  if (err instanceof TypeError) {
    // fetch throws TypeError on connection refused / DNS / CORS failures
    return `Could not reach the matching service at ${API_URL}. Is the backend running?`;
  }
  return err instanceof Error ? err.message : "Unexpected error during the match run.";
}

/**
 * Run a match and yield typed StreamEvents as they arrive. Pass an AbortSignal
 * to cancel; aborting rejects the underlying fetch (surfaced as AbortError).
 */
export async function* streamMatch(
  patient: PatientProfile,
  maxResults: number,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_URL}/api/v1/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(buildMatchRequest(patient, maxResults)),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Matching service responded with HTTP ${res.status}.`);
  }
  if (!res.body) {
    throw new Error("Matching service returned an empty response stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { frames, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      const event = decodeStreamEvent(frame);
      if (event) yield event;
    }
  }

  // Flush a final frame that arrived without a trailing blank line.
  const tail = parseSseFrames(buffer.endsWith("\n\n") ? buffer : buffer + "\n\n");
  for (const frame of tail.frames) {
    const event = decodeStreamEvent(frame);
    if (event) yield event;
  }
}

/** Fetch trial metadata (phase/status) for the results header. */
export async function fetchTrialDetail(
  nctId: string,
  signal?: AbortSignal,
): Promise<TrialDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/trials/${nctId}`, { signal });
    if (!res.ok) return null;
    return (await res.json()) as TrialDetail;
  } catch {
    return null; // header degrades gracefully to title + link only
  }
}

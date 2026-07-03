/**
 * Minimal, robust Server-Sent Events frame parser.
 *
 * The backend streams `POST /api/v1/match` as SSE (sse-starlette), so we consume
 * it with `fetch` + a ReadableStream reader — NOT `EventSource`, which is
 * GET-only. This module is the pure, unit-tested core of that: feed it decoded
 * text chunks, get back complete events plus any partial remainder to carry
 * into the next chunk.
 *
 * SSE wire format handled here:
 *   - frames separated by a blank line (\n\n)
 *   - multiple `data:` lines within a frame are joined with \n
 *   - `event:` names the frame (defaults to "message")
 *   - lines beginning with ":" are comments/keepalives and are ignored
 *   - CRLF and LF line endings both accepted
 */

import type { StreamEvent } from "./types";

export interface SseFrame {
  event: string;
  data: string;
}

const KNOWN_EVENTS = new Set([
  "state_update",
  "clarification_required",
  "final_result",
  "error",
]);

/**
 * Split a buffer into complete SSE frames plus the trailing partial remainder.
 * Incomplete trailing frames are returned in `rest` so the caller can prepend
 * the next network chunk before re-parsing.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  // The final element is either "" (buffer ended on a frame boundary) or a
  // partial frame not yet terminated — either way it is carried forward.
  const rest = parts.pop() ?? "";

  const frames: SseFrame[] = [];
  for (const raw of parts) {
    const frame = parseSingleFrame(raw);
    if (frame) frames.push(frame);
  }
  return { frames, rest };
}

function parseSingleFrame(block: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // blank or comment/keepalive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Per spec, a single leading space after the colon is stripped.
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    // `id` / `retry` are accepted but unused by this contract.
  }

  if (dataLines.length === 0) return null; // nothing actionable (pure keepalive)
  return { event, data: dataLines.join("\n") };
}

/**
 * Decode a raw frame into a typed StreamEvent, or null if it is not a
 * recognized/parseable event (defensive against keepalives and malformed data).
 * The `event` name from the frame is trusted as the discriminant, matching the
 * backend which sets both the SSE `event:` field and the JSON `event` key.
 */
export function decodeStreamEvent(frame: SseFrame): StreamEvent | null {
  if (!KNOWN_EVENTS.has(frame.event)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { event?: unknown }).event !== frame.event
  ) {
    return null;
  }
  return parsed as StreamEvent;
}

import { describe, expect, it } from "vitest";

import { decodeStreamEvent, parseSseFrames } from "@/lib/sse";

describe("parseSseFrames", () => {
  it("parses a single complete frame", () => {
    const { frames, rest } = parseSseFrames(
      "event: state_update\ndata: {\"event\":\"state_update\"}\n\n",
    );
    expect(frames).toEqual([{ event: "state_update", data: '{"event":"state_update"}' }]);
    expect(rest).toBe("");
  });

  it("parses multiple frames in one buffer", () => {
    const buf =
      "event: state_update\ndata: a\n\n" + "event: final_result\ndata: b\n\n";
    const { frames } = parseSseFrames(buf);
    expect(frames.map((f) => f.event)).toEqual(["state_update", "final_result"]);
    expect(frames.map((f) => f.data)).toEqual(["a", "b"]);
  });

  it("carries a partial trailing frame into rest and completes it on the next chunk", () => {
    const first = parseSseFrames("event: state_update\ndata: {\"partial\":");
    expect(first.frames).toEqual([]);
    expect(first.rest).toBe('event: state_update\ndata: {"partial":');

    const second = parseSseFrames(first.rest + 'true}\n\n');
    expect(second.frames).toEqual([
      { event: "state_update", data: '{"partial":true}' },
    ]);
    expect(second.rest).toBe("");
  });

  it("joins multi-line data fields with a newline", () => {
    const { frames } = parseSseFrames("event: error\ndata: line1\ndata: line2\n\n");
    expect(frames[0].data).toBe("line1\nline2");
  });

  it("ignores comment/keepalive lines and strips one leading space after the colon", () => {
    const { frames } = parseSseFrames(": keep-alive ping\ndata: {\"x\":1}\n\n");
    expect(frames).toEqual([{ event: "message", data: '{"x":1}' }]);
  });

  it("normalizes CRLF line endings", () => {
    const { frames } = parseSseFrames("event: error\r\ndata: oops\r\n\r\n");
    expect(frames).toEqual([{ event: "error", data: "oops" }]);
  });

  it("drops pure-keepalive frames with no data", () => {
    const { frames } = parseSseFrames(": ping\n\n");
    expect(frames).toEqual([]);
  });
});

describe("decodeStreamEvent", () => {
  it("decodes a valid final_result frame", () => {
    const decoded = decodeStreamEvent({
      event: "final_result",
      data: JSON.stringify({ event: "final_result", report: { trial_verdicts: [] } }),
    });
    expect(decoded?.event).toBe("final_result");
  });

  it("returns null for an unknown event name", () => {
    expect(decodeStreamEvent({ event: "ping", data: "{}" })).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(decodeStreamEvent({ event: "error", data: "{not json" })).toBeNull();
  });

  it("returns null when the JSON event key disagrees with the frame event", () => {
    const decoded = decodeStreamEvent({
      event: "error",
      data: JSON.stringify({ event: "state_update", node: "x", status: "completed" }),
    });
    expect(decoded).toBeNull();
  });
});

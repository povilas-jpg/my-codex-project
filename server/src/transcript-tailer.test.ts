import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TranscriptTailer,
  type AssistantMessage,
  type ToolUseEvent,
} from "./transcript-tailer.js";

/** One transcript line as claude writes them. */
function assistantLine(
  text: string | unknown[],
  extra: Record<string, unknown> = {},
): string {
  return `${JSON.stringify({
    type: "assistant",
    uuid: `u-${Math.random().toString(36).slice(2)}`,
    sessionId: "sess-1",
    message: { role: "assistant", content: text },
    ...extra,
  })}\n`;
}

describe("TranscriptTailer", () => {
  let dir: string;
  let tailer: TranscriptTailer;
  let seen: AssistantMessage[];
  let tools: ToolUseEvent[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claude-pad-tailer-"));
    tailer = new TranscriptTailer(dir);
    seen = [];
    tools = [];
    tailer.on("assistant", (m: AssistantMessage) => seen.push(m));
    tailer.on("tool", (t: ToolUseEvent) => tools.push(t));
  });

  afterEach(() => {
    tailer.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const file = (id = "sess-1") => join(dir, `${id}.jsonl`);

  it("emits text from an assistant message", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(file(), assistantLine([{ type: "text", text: "All done." }]));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["All done."]);
    expect(seen[0].sessionId).toBe("sess-1");
  });

  it("does not replay history written before the session was set", () => {
    writeFileSync(file(), assistantLine([{ type: "text", text: "old news" }]));
    tailer.setSession("sess-1");
    tailer.poll();
    expect(seen).toEqual([]);

    appendFileSync(file(), assistantLine([{ type: "text", text: "fresh" }]));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["fresh"]);
  });

  it("joins multiple text blocks and reports tool use separately", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(
      file(),
      assistantLine([
        { type: "text", text: "First." },
        { type: "tool_use", name: "Read", input: { file_path: "/tmp/a.ts" } },
        { type: "text", text: "Second." },
      ]),
    );
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["First.\n\nSecond."]);
    expect(tools).toEqual([{ name: "Read", target: "/tmp/a.ts", at: expect.any(Number) }]);
  });

  it("ignores thinking blocks", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(
      file(),
      assistantLine([
        { type: "thinking", thinking: "hmm, let me reconsider" },
        { type: "text", text: "Answer." },
      ]),
    );
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["Answer."]);
  });

  it("skips subagent (sidechain) transcripts", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(
      file(),
      assistantLine([{ type: "text", text: "subagent chatter" }], { isSidechain: true }),
    );
    tailer.poll();
    expect(seen).toEqual([]);
  });

  it("emits a message only once even if its line is written again", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    const line = assistantLine([{ type: "text", text: "streamed" }], { uuid: "fixed-uuid" });
    appendFileSync(file(), line);
    tailer.poll();
    appendFileSync(file(), line);
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["streamed"]);
  });

  it("handles a line split across two polls", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    const line = assistantLine([{ type: "text", text: "halves" }]);
    const cut = Math.floor(line.length / 2);
    appendFileSync(file(), line.slice(0, cut));
    tailer.poll();
    expect(seen).toEqual([]);
    appendFileSync(file(), line.slice(cut));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["halves"]);
  });

  it("does not corrupt multi-byte characters split across reads", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    const line = assistantLine([{ type: "text", text: "ačiū — 你好" }]);
    const buf = Buffer.from(line, "utf8");
    // Cut inside the first multi-byte character of the payload.
    const cut = buf.indexOf(Buffer.from("ačiū", "utf8")) + 2;
    appendFileSync(file(), buf.subarray(0, cut));
    tailer.poll();
    appendFileSync(file(), buf.subarray(cut));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["ačiū — 你好"]);
  });

  it("survives malformed and unknown lines", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(file(), "{not json\n");
    appendFileSync(file(), `${JSON.stringify({ type: "user", message: {} })}\n`);
    appendFileSync(file(), `${JSON.stringify({ type: "assistant" })}\n`);
    appendFileSync(file(), assistantLine("plain string content"));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["plain string content"]);
  });

  it("resyncs when the transcript is truncated in place", () => {
    writeFileSync(file(), assistantLine([{ type: "text", text: "x".repeat(500) }]));
    tailer.setSession("sess-1");
    tailer.poll();
    writeFileSync(file(), assistantLine([{ type: "text", text: "short" }]));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["short"]);
  });

  it("resyncs when the transcript is replaced by a file of similar size", () => {
    // Size alone can't catch this — only the inode change does.
    writeFileSync(file(), assistantLine([{ type: "text", text: "aaaaaaaaaa" }]));
    tailer.setSession("sess-1");
    tailer.poll();
    expect(seen).toEqual([]);

    rmSync(file());
    writeFileSync(file(), assistantLine([{ type: "text", text: "bbbbbbbbbb" }]));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["bbbbbbbbbb"]);
  });

  it("switches files when the session changes", () => {
    writeFileSync(file("sess-1"), "");
    writeFileSync(file("sess-2"), "");
    tailer.setSession("sess-1");
    appendFileSync(file("sess-1"), assistantLine([{ type: "text", text: "one" }]));
    tailer.poll();

    tailer.setSession("sess-2");
    appendFileSync(file("sess-2"), assistantLine([{ type: "text", text: "two" }]));
    appendFileSync(file("sess-1"), assistantLine([{ type: "text", text: "ignored" }]));
    tailer.poll();

    expect(seen.map((m) => m.text)).toEqual(["one", "two"]);
  });

  it("tolerates a session whose transcript does not exist yet", () => {
    tailer.setSession("not-created-yet");
    expect(() => tailer.poll()).not.toThrow();
    writeFileSync(file("not-created-yet"), assistantLine([{ type: "text", text: "born" }]));
    tailer.poll();
    expect(seen.map((m) => m.text)).toEqual(["born"]);
  });

  it("follows the newest transcript when no session id is known", () => {
    const follower = new TranscriptTailer(dir, { followNewest: true });
    const got: string[] = [];
    follower.on("assistant", (m: AssistantMessage) => got.push(m.text));
    writeFileSync(file("older"), "");
    writeFileSync(file("newer"), "");
    follower.poll();
    appendFileSync(file("newer"), assistantLine([{ type: "text", text: "newest wins" }]));
    follower.poll();
    expect(got).toEqual(["newest wins"]);
    follower.stop();
  });

  it("shortens an overlong tool target", () => {
    writeFileSync(file(), "");
    tailer.setSession("sess-1");
    appendFileSync(
      file(),
      assistantLine([
        { type: "tool_use", name: "Bash", input: { command: "x".repeat(200) } },
      ]),
    );
    tailer.poll();
    expect(tools[0].target).toHaveLength(60);
    expect(tools[0].target?.endsWith("…")).toBe(true);
  });
});

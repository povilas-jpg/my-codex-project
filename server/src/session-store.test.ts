import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionStore, encodeProjectDir, isValidSessionId } from "./session-store.js";

const PROJECT = "/home/dev/my-app";

function line(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

function userLine(content: string, extra: Record<string, unknown> = {}): string {
  return line({ type: "user", message: { role: "user", content }, ...extra });
}

function assistantLine(text: string): string {
  return line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
}

describe("SessionStore", () => {
  let home: string;
  let dir: string;
  let store: SessionStore;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "claude-pad-store-test-"));
    dir = join(home, "projects", encodeProjectDir(PROJECT));
    mkdirSync(dir, { recursive: true });
    store = new SessionStore(PROJECT, home);
  });

  it("encodes project dirs the way claude does", () => {
    expect(encodeProjectDir("/home/user/my-codex-project")).toBe("-home-user-my-codex-project");
    expect(encodeProjectDir("/a/b.c_d")).toBe("-a-b-c-d");
  });

  it("returns empty when the project has no sessions", () => {
    expect(new SessionStore("/never/used", home).listChats()).toEqual([]);
  });

  it("lists chats newest-first with titles and counts", () => {
    writeFileSync(
      join(dir, "aaaa1111-0000-0000-0000-000000000001.jsonl"),
      userLine("Fix the login bug") + assistantLine("On it.") + userLine("thanks"),
    );
    writeFileSync(
      join(dir, "bbbb2222-0000-0000-0000-000000000002.jsonl"),
      userLine("Add dark mode to settings") + assistantLine("Sure."),
    );
    const chats = store.listChats();
    expect(chats).toHaveLength(2);
    const byId = Object.fromEntries(chats.map((c) => [c.id, c]));
    expect(byId["aaaa1111-0000-0000-0000-000000000001"]!.title).toBe("Fix the login bug");
    expect(byId["aaaa1111-0000-0000-0000-000000000001"]!.messageCount).toBe(3);
    expect(byId["bbbb2222-0000-0000-0000-000000000002"]!.messageCount).toBe(2);
    expect(chats[0]!.mtimeMs).toBeGreaterThanOrEqual(chats[1]!.mtimeMs);
  });

  it("skips sidechain (subagent) transcripts, empty files, and non-jsonl", () => {
    writeFileSync(join(dir, "side.jsonl"), line({ type: "user", isSidechain: true, message: { content: "x" } }));
    writeFileSync(join(dir, "empty.jsonl"), "");
    writeFileSync(join(dir, "notes.txt"), "not a session");
    writeFileSync(join(dir, "real.jsonl"), userLine("hello"));
    const chats = store.listChats();
    expect(chats.map((c) => c.id)).toEqual(["real"]);
  });

  it("falls back to slug, then id, for titles; skips tag-shaped first messages", () => {
    writeFileSync(
      join(dir, "slugged.jsonl"),
      line({ type: "queue-operation", slug: "fix-flaky-tests-quickly" }) +
        userLine("<system-reminder>meta</system-reminder>"),
    );
    writeFileSync(join(dir, "bare0000-1111.jsonl"), line({ type: "queue-operation" }));
    const byId = Object.fromEntries(store.listChats().map((c) => [c.id, c]));
    expect(byId["slugged"]!.title).toBe("fix flaky tests quickly");
    expect(byId["bare0000-1111"]!.title).toBe("bare0000");
  });

  it("tolerates a truncated tail line (live transcript mid-write)", () => {
    writeFileSync(join(dir, "live.jsonl"), userLine("count me") + '{"type":"assist');
    const chats = store.listChats();
    expect(chats[0]!.title).toBe("count me");
    expect(chats[0]!.messageCount).toBe(1);
  });

  it("searches titles and message content, case-insensitive", () => {
    writeFileSync(join(dir, "one.jsonl"), userLine("Refactor auth module") + assistantLine("I renamed WidgetFactory."));
    writeFileSync(join(dir, "two.jsonl"), userLine("Write release notes"));
    expect(store.listChats("AUTH").map((c) => c.id)).toEqual(["one"]);
    expect(store.listChats("widgetfactory").map((c) => c.id)).toEqual(["one"]);
    expect(store.listChats("release").map((c) => c.id)).toEqual(["two"]);
    expect(store.listChats("no-such-thing-anywhere")).toEqual([]);
  });

  it("caches by mtime+size but sees new content on change", () => {
    const p = join(dir, "grow.jsonl");
    writeFileSync(p, userLine("v1"));
    expect(store.listChats()[0]!.messageCount).toBe(1);
    writeFileSync(p, userLine("v1") + assistantLine("v2"));
    expect(store.listChats()[0]!.messageCount).toBe(2);
  });
});

describe("isValidSessionId", () => {
  it("accepts uuids and rejects shell metacharacters", () => {
    expect(isValidSessionId("a1e3d40b-7bd6-5753-8aed-c1b7041d0af7")).toBe(true);
    expect(isValidSessionId("short")).toBe(false);
    expect(isValidSessionId("abc; rm -rf /tmp/x")).toBe(false);
    expect(isValidSessionId("../../etc/passwd")).toBe(false);
  });
});

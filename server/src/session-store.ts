import { readdirSync, readFileSync, statSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import type { ChatSummary } from "../../shared/protocol.js";

/**
 * Reads Claude Code's per-project conversation transcripts:
 *   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
 *
 * The format is internal to claude, so every parse here is defensive: a file
 * that can't be parsed still lists (title falls back to its id), and total
 * failure degrades to an empty list — the pad's UI then points users at the
 * CLI's own /resume picker (drive it with the d-pad).
 */

interface CacheEntry {
  mtimeMs: number;
  size: number;
  summary: ChatSummary;
}

/** Max bytes to scan per file for titles/search (guards huge transcripts). */
const SCAN_LIMIT = 2 * 1024 * 1024;

export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export class SessionStore {
  private readonly dir: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    projectCwd: string,
    // claude honors CLAUDE_CONFIG_DIR for its state dir; mirror that here.
    claudeHome: string = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
  ) {
    this.dir = join(claudeHome, "projects", encodeProjectDir(projectCwd));
  }

  get projectsDir(): string {
    return this.dir;
  }

  listChats(query?: string): ChatSummary[] {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return []; // no chats yet for this project
    }

    const chats: ChatSummary[] = [];
    for (const file of files) {
      const path = join(this.dir, file);
      try {
        const st = statSync(path);
        if (st.size === 0) continue;
        const id = basename(file, ".jsonl");
        const cached = this.cache.get(path);
        let summary: ChatSummary;
        if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
          summary = cached.summary;
        } else {
          const parsed = this.parseFile(path, id);
          if (!parsed) continue; // sidechain/subagent transcript
          summary = { ...parsed, mtimeMs: st.mtimeMs };
          this.cache.set(path, { mtimeMs: st.mtimeMs, size: st.size, summary });
        }
        chats.push(summary);
      } catch {
        // unreadable file — skip
      }
    }

    chats.sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (!query?.trim()) return chats.slice(0, 100);

    const q = query.trim().toLowerCase();
    const matches = chats.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      try {
        // Content search over the raw JSONL text (bounded).
        return this.readHead(join(this.dir, `${c.id}.jsonl`)).toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
    return matches.slice(0, 100);
  }

  private readHead(path: string): string {
    const st = statSync(path);
    if (st.size <= SCAN_LIMIT) return readFileSync(path, "utf8");
    const fd = createReadStream(path, { start: 0, end: SCAN_LIMIT - 1, encoding: "utf8" });
    // createReadStream is async; for the bounded case fall back to a sliced sync read.
    fd.destroy();
    return readFileSync(path, "utf8").slice(0, SCAN_LIMIT);
  }

  private parseFile(path: string, id: string): Omit<ChatSummary, "mtimeMs"> | null {
    const text = this.readHead(path);
    const lines = text.split("\n");
    let title = "";
    let slug = "";
    let messageCount = 0;
    let sawRealLine = false;

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // truncated tail line etc.
      }
      sawRealLine = true;
      if (obj.isSidechain === true) return null; // subagent transcript, not a chat
      if (obj.type === "user" || obj.type === "assistant") messageCount++;
      if (!slug && typeof obj.slug === "string") slug = obj.slug;
      if (!title && obj.type === "user") {
        const msg = obj.message as { content?: unknown } | undefined;
        if (msg && typeof msg.content === "string") {
          const t = msg.content.trim();
          if (t && !t.startsWith("<")) title = t; // skip system-reminder-style content
        }
      }
    }
    // Note: for transcripts larger than SCAN_LIMIT the head is truncated, so
    // messageCount is approximate there; titles come from the first lines.

    if (!sawRealLine) return null;
    if (!title && slug) title = slug.replace(/-/g, " ");
    if (!title) title = id.slice(0, 8);
    if (title.length > 120) title = `${title.slice(0, 117)}...`;
    return { id, title, messageCount };
  }
}

/** claude --resume takes a session UUID; keep argv injection impossible. */
export function isValidSessionId(id: string): boolean {
  return /^[a-zA-Z0-9-]{8,64}$/.test(id);
}

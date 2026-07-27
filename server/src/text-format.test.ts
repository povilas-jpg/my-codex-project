import { describe, expect, it } from "vitest";
import {
  formatForGlasses,
  paginate,
  summarize,
  toPlainText,
  wrapLines,
} from "./text-format.js";

describe("toPlainText", () => {
  it("strips headings, emphasis, links and inline code", () => {
    const md = "## Done\nI fixed **the bug** in `parse()` — see [the PR](https://x.dev/1).";
    expect(toPlainText(md)).toBe("Done\nI fixed the bug in parse() — see the PR.");
  });

  it("normalises bullets and keeps numbered steps", () => {
    const md = "- first\n* second\n+ third\n\n1. step one\n2) step two";
    expect(toPlainText(md)).toBe("• first\n• second\n• third\n\n1. step one\n2. step two");
  });

  it("keeps short code blocks verbatim", () => {
    const md = "Run:\n```bash\nnpm test\n```";
    expect(toPlainText(md)).toBe("Run:\nnpm test");
  });

  it("collapses long code blocks to a summary", () => {
    const body = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
    expect(toPlainText(`Here:\n\`\`\`ts\n${body}\n\`\`\``)).toBe("Here:\n[code: 12 lines]");
  });

  it("respects a custom maxCodeLines threshold", () => {
    const md = "```\na\nb\nc\n```";
    expect(toPlainText(md, { maxCodeLines: 2 })).toBe("[code: 3 lines]");
    expect(toPlainText(md, { maxCodeLines: 3 })).toBe("a\nb\nc");
  });

  it("does not treat text after an unterminated fence as prose", () => {
    const md = "before\n```\nnot closed\nstill code";
    expect(toPlainText(md)).toBe("before\nnot closed\nstill code");
  });

  it("flattens tables and drops rules and separator rows", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\ndone";
    expect(toPlainText(md)).toBe("a · b\n1 · 2\n\ndone");
  });

  it("strips blockquotes and drops comment-only lines entirely", () => {
    expect(toPlainText("> quoted\n<!-- hidden -->\nvisible")).toBe("quoted\nvisible");
  });

  it("collapses runs of blank lines", () => {
    expect(toPlainText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("leaves plain prose untouched", () => {
    expect(toPlainText("just a sentence")).toBe("just a sentence");
  });
});

describe("wrapLines", () => {
  it("wraps at word boundaries", () => {
    expect(wrapLines("the quick brown fox jumps", 10)).toEqual([
      "the quick",
      "brown fox",
      "jumps",
    ]);
  });

  it("never emits a line longer than the column", () => {
    const text = "supercalifragilisticexpialidocious and friends";
    for (const line of wrapLines(text, 12)) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
  });

  it("hard-splits words that cannot fit", () => {
    expect(wrapLines("aaaaaaaaaa", 4)).toEqual(["aaaa", "aaaa", "aa"]);
  });

  it("preserves paragraph breaks", () => {
    expect(wrapLines("one\n\ntwo", 20)).toEqual(["one", "", "two"]);
  });

  it("drops trailing blank lines", () => {
    expect(wrapLines("one\n\n", 20)).toEqual(["one"]);
  });

  it("rejects a non-positive column count", () => {
    expect(() => wrapLines("x", 0)).toThrow(/columns/);
  });
});

describe("paginate", () => {
  it("groups lines into fixed-height pages", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2)).toEqual(["a\nb", "c\nd", "e"]);
  });

  it("returns no pages for no lines", () => {
    expect(paginate([], 5)).toEqual([]);
  });
});

describe("formatForGlasses", () => {
  it("produces pages that fit the display box", () => {
    const md = "# Result\n\nI updated **three** files and ran the tests; they all pass now.";
    const { pages, lines } = formatForGlasses(md, { columns: 20, linesPerPage: 3 });
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(pages.every((p) => p.split("\n").length <= 3)).toBe(true);
    expect(pages.join(" ")).toContain("three");
  });

  it("handles an empty reply without throwing", () => {
    expect(formatForGlasses("")).toEqual({ plain: "", lines: [], pages: [] });
  });
});

describe("summarize", () => {
  it("takes the first sentence", () => {
    expect(summarize("Fixed it. Then I also refactored the parser.")).toBe("Fixed it.");
  });

  it("truncates with an ellipsis when too long", () => {
    expect(summarize("a".repeat(60), 20)).toHaveLength(20);
    expect(summarize("a".repeat(60), 20).endsWith("…")).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(summarize("")).toBe("");
  });
});

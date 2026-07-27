/**
 * Turns Claude's markdown replies into something readable on a heads-up
 * display: no markdown syntax, no code dumps, wrapped to a fixed column and
 * split into pages the wearer taps through.
 *
 * The G2 (like the G1 before it) shows roughly five short lines at a time, so
 * "render the whole answer" is never the goal — the goal is that the first
 * page carries the answer and the rest is there if you want it.
 */

export interface GlassesTextOptions {
  /** Characters per line. 40 fits a G1/G2-class HUD at the default font. */
  columns?: number;
  /** Lines per page. */
  linesPerPage?: number;
  /** Fenced code blocks longer than this collapse to a one-line summary. */
  maxCodeLines?: number;
}

export interface GlassesText {
  /** Markdown stripped, whitespace normalised, still unwrapped. */
  plain: string;
  /** `plain` wrapped to `columns`. */
  lines: string[];
  /** `lines` grouped into pages of `linesPerPage`, each joined by "\n". */
  pages: string[];
}

const DEFAULTS: Required<GlassesTextOptions> = {
  columns: 40,
  linesPerPage: 5,
  maxCodeLines: 6,
};

/**
 * Strip markdown down to speakable/showable prose.
 *
 * Fenced code is the interesting case: a 200-line diff is worse than useless
 * on a HUD, but a three-line shell command is exactly what you want to see.
 * Short blocks survive verbatim, long ones become "[code: N lines]".
 */
export function toPlainText(markdown: string, options: GlassesTextOptions = {}): string {
  const { maxCodeLines } = { ...DEFAULTS, ...options };
  const source = markdown.replace(/\r\n/g, "\n");

  const out: string[] = [];
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const fence = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      const marker = (fence[1] ?? "```").slice(0, 1).repeat(3);
      const closing = new RegExp(`^\\s*${marker}`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closing.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // closing fence (or EOF)
      const trimmed = trimBlankEdges(body);
      if (trimmed.length === 0) {
        // empty block — drop it
      } else if (trimmed.length <= maxCodeLines) {
        out.push(...trimmed);
      } else {
        out.push(`[code: ${trimmed.length} lines]`);
      }
      continue;
    }
    const stripped = stripInline(line);
    // A line that was pure markup (rule, table separator, lone comment) is
    // removed outright — emitting "" would leave a phantom paragraph break.
    if (stripped !== null) out.push(stripped);
    i++;
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") start++;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end--;
  return lines.slice(start, end);
}

/**
 * Markdown constructs that live inside a single line.
 *
 * Returns null when the line held nothing but markup, so the caller can drop
 * it rather than turn it into a blank line.
 */
function stripInline(input: string): string | null {
  const blank = input.trim() === "";
  let s = input;

  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Horizontal rules carry no meaning once the styling is gone.
  if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(s)) return null;

  // Table separator rows (|---|:--:|) likewise.
  if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(s) && s.includes("-")) return null;

  // Table rows become "cell · cell".
  if (/^\s*\|.*\|\s*$/.test(s)) {
    s = s
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" · ");
  }

  s = s.replace(/^\s{0,3}#{1,6}\s+/, ""); // headings
  s = s.replace(/^\s{0,3}>\s?/, ""); // blockquote

  // Bullets → a single glyph the HUD renders cleanly. Numbered lists keep
  // their numbers, which are load-bearing when Claude lists steps.
  s = s.replace(/^(\s*)[-*+]\s+/, "$1• ");
  s = s.replace(/^(\s*)(\d+)[.)]\s+/, "$1$2. ");

  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images → alt
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links → text
  s = s.replace(/`([^`]+)`/g, "$1"); // inline code
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2"); // bold
  s = s.replace(/(\*|_)(?=\S)([^*_]*?\S)\1/g, "$2"); // italic
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1"); // strikethrough

  // Had content, markup consumed all of it → nothing worth a line.
  if (!blank && s.trim() === "") return null;
  return s;
}

/**
 * Greedy word wrap. Words longer than the column (URLs, long identifiers) are
 * hard-split rather than allowed to overflow — a clipped line on a HUD loses
 * its tail silently, which is worse than an ugly break.
 */
export function wrapLines(text: string, columns: number): string[] {
  if (columns <= 0) throw new Error("columns must be positive");
  const out: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }
    // Keep list indentation on continuation lines so wrapped bullets read as
    // one item rather than as new ones.
    const indentMatch = /^(\s*)(•\s+|\d+\.\s+)?/.exec(paragraph);
    const hanging = " ".repeat(Math.min((indentMatch?.[0].length ?? 0), Math.max(columns - 8, 0)));

    let current = "";
    const push = () => {
      if (current !== "") {
        out.push(current);
        current = "";
      }
    };

    for (const word of paragraph.trim().split(/\s+/)) {
      const prefix = out.length && current === "" ? hanging : "";
      let candidate = current === "" ? prefix + word : `${current} ${word}`;

      if (candidate.length <= columns) {
        current = candidate;
        continue;
      }
      push();
      // Word alone still too long → hard-split it across lines.
      let rest = word;
      while (rest.length > columns) {
        out.push(rest.slice(0, columns));
        rest = rest.slice(columns);
      }
      current = rest;
    }
    push();
  }

  // A trailing blank line adds nothing on a 5-line display.
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Group wrapped lines into fixed-height pages. */
export function paginate(lines: string[], linesPerPage: number): string[] {
  if (linesPerPage <= 0) throw new Error("linesPerPage must be positive");
  if (lines.length === 0) return [];
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage).join("\n"));
  }
  return pages;
}

/** Full markdown → HUD pipeline. */
export function formatForGlasses(
  markdown: string,
  options: GlassesTextOptions = {},
): GlassesText {
  const opts = { ...DEFAULTS, ...options };
  const plain = toPlainText(markdown, opts);
  const lines = wrapLines(plain, opts.columns);
  return { plain, lines, pages: paginate(lines, opts.linesPerPage) };
}

/**
 * A one-line gist for the dashboard/status line — first sentence, or first
 * clause, capped to the column width.
 */
export function summarize(markdown: string, columns = DEFAULTS.columns): string {
  const plain = toPlainText(markdown);
  if (!plain) return "";
  const firstLine = plain.split("\n").find((l) => l.trim() !== "") ?? "";
  const sentence = /^(.*?[.!?])(\s|$)/.exec(firstLine)?.[1] ?? firstLine;
  if (sentence.length <= columns) return sentence;
  return `${sentence.slice(0, Math.max(columns - 1, 1)).trimEnd()}…`;
}

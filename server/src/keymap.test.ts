import { describe, expect, it } from "vitest";
import { KEY_SEQUENCES, sequenceFor } from "./keymap.js";

describe("keymap", () => {
  it("encodes the sequences claude's ink input layer expects", () => {
    expect(KEY_SEQUENCES.enter).toBe("\r");
    expect(KEY_SEQUENCES.escape).toBe("\x1b");
    expect(KEY_SEQUENCES.tab).toBe("\t");
    expect(KEY_SEQUENCES.shift_tab).toBe("\x1b[Z");
    expect(KEY_SEQUENCES.up).toBe("\x1b[A");
    expect(KEY_SEQUENCES.down).toBe("\x1b[B");
    expect(KEY_SEQUENCES.left).toBe("\x1b[D");
    expect(KEY_SEQUENCES.right).toBe("\x1b[C");
    expect(KEY_SEQUENCES.ctrl_c).toBe("\x03");
  });

  it("returns undefined for unknown keys", () => {
    expect(sequenceFor("nope" as never)).toBeUndefined();
  });
});

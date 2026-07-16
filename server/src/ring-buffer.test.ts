import { describe, expect, it } from "vitest";
import { RingBuffer } from "./ring-buffer.js";

describe("RingBuffer", () => {
  it("returns everything under capacity", () => {
    const rb = new RingBuffer(100);
    rb.push("abc");
    rb.push("def");
    expect(rb.snapshot()).toBe("abcdef");
  });

  it("drops oldest chunks over capacity", () => {
    const rb = new RingBuffer(10);
    rb.push("aaaa");
    rb.push("bbbb");
    rb.push("cccc"); // 12 chars -> "aaaa" evicted
    expect(rb.snapshot()).toBe("bbbbcccc");
  });

  it("always keeps the newest chunk even if it alone exceeds capacity", () => {
    const rb = new RingBuffer(4);
    rb.push("0123456789");
    expect(rb.snapshot()).toBe("0123456789");
  });

  it("clears", () => {
    const rb = new RingBuffer(10);
    rb.push("xx");
    rb.clear();
    expect(rb.snapshot()).toBe("");
  });
});

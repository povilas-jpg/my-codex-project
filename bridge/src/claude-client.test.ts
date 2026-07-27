import { describe, expect, it, vi } from "vitest";
import type { PadEvent } from "../../shared/text-protocol.js";
import { ClaudePadClient, ClaudePadError, readSse } from "./claude-client.js";

/** Build a ReadableStream from string chunks, as an SSE body would arrive. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readSse", () => {
  it("parses one frame per blank-line-separated block", async () => {
    const events: PadEvent[] = [];
    await readSse(
      streamOf([
        'data: {"type":"tool","name":"Read","at":1}\n\n',
        'data: {"type":"turn_end","turnId":"t","status":"done"}\n\n',
      ]),
      (e) => events.push(e),
    );
    expect(events.map((e) => e.type)).toEqual(["tool", "turn_end"]);
  });

  it("reassembles a frame split across chunks", async () => {
    const events: PadEvent[] = [];
    await readSse(streamOf(['data: {"type":"tool","na', 'me":"Bash","at":1}\n\n']), (e) =>
      events.push(e),
    );
    expect(events).toEqual([{ type: "tool", name: "Bash", at: 1 }]);
  });

  it("ignores keepalive comments", async () => {
    const events: PadEvent[] = [];
    await readSse(streamOf([": keepalive\n\n", 'data: {"type":"needs_input"}\n\n']), (e) =>
      events.push(e),
    );
    expect(events).toEqual([{ type: "needs_input" }]);
  });

  it("skips an unparseable frame without ending the stream", async () => {
    const events: PadEvent[] = [];
    await readSse(streamOf(["data: {oops\n\n", 'data: {"type":"needs_input"}\n\n']), (e) =>
      events.push(e),
    );
    expect(events).toEqual([{ type: "needs_input" }]);
  });

  it("joins multi-line data fields", async () => {
    const events: PadEvent[] = [];
    await readSse(streamOf(['data: {"type":\ndata: "needs_input"}\n\n']), (e) => events.push(e));
    expect(events).toEqual([{ type: "needs_input" }]);
  });
});

describe("ClaudePadClient", () => {
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("posts a prompt with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => ok({ turnId: "t1", prompt: "hi", submitted: true }));
    const client = new ClaudePadClient({
      baseUrl: "http://pi.tail1234.ts.net:7433",
      token: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.prompt("hi");
    expect(res.turnId).toBe("t1");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://pi.tail1234.ts.net:7433/api/prompt");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hi", submit: true });
  });

  it("omits the auth header when there is no token", async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true }));
    const client = new ClaudePadClient({
      baseUrl: "http://localhost:7433",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.key("enter");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("strips a trailing slash from the base url", async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true }));
    const client = new ClaudePadClient({
      baseUrl: "http://localhost:7433/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.newSession();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://localhost:7433/api/new");
  });

  it("sends display geometry when reading state", async () => {
    const fetchImpl = vi.fn(async () => ok({ status: "idle" }));
    const client = new ClaudePadClient({
      baseUrl: "http://localhost:7433",
      columns: 32,
      lines: 4,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.state();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "http://localhost:7433/api/state?columns=32&lines=4",
    );
  });

  it("raises a typed error carrying the status code", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid token", { status: 401 }));
    const client = new ClaudePadClient({
      baseUrl: "http://localhost:7433",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.prompt("hi")).rejects.toBeInstanceOf(ClaudePadError);
    await expect(client.prompt("hi")).rejects.toMatchObject({ status: 401 });
  });

  it("reconnects after the stream drops, then stops when closed", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error("network down");
      return new Response(streamOf(['data: {"type":"needs_input"}\n\n']), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const client = new ClaudePadClient({
      baseUrl: "http://localhost:7433",
      minRetryMs: 1,
      maxRetryMs: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const events: PadEvent[] = [];
    const errors: Error[] = [];
    const running = client.connect({
      onEvent: (e) => {
        events.push(e);
        client.close(); // one good frame is enough for this test
      },
      onError: (e) => errors.push(e),
    });

    await running;
    expect(errors.map((e) => e.message)).toEqual(["network down"]);
    expect(events).toEqual([{ type: "needs_input" }]);
    expect(attempts).toBe(2);
  });
});

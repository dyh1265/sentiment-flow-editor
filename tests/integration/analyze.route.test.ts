import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI module so /api/analyze can exercise llm mode without network.
const createMock = vi.fn();
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {
      /* noop */
    }
  }
  return { default: MockOpenAI };
});

// Reset module cache so the route re-imports with fresh mocks and env vars.
async function loadRoute() {
  return await import("@/app/api/analyze/route");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/analyze", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing text", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "", mode: "local" }));
    expect(res.status).toBe(400);
  });

  it("scores text locally without calling OpenAI", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ text: "I love this. This is terrible.", mode: "local" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("local");
    expect(data.sentences).toHaveLength(2);
    expect(data.sentences[0].score).toBeGreaterThan(0);
    expect(data.sentences[1].score).toBeLessThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("scores text via OpenAI when mode=llm", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sentences: [
                { index: 0, score: 0.9 },
                { index: 1, score: -0.8 },
              ],
            }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ text: "Amazing day. Awful meeting.", mode: "llm" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mode).toBe("llm");
    expect(data.sentences).toHaveLength(2);
    expect(data.sentences[0].score).toBeCloseTo(0.9, 5);
    expect(data.sentences[0].label).toBe("positive");
    expect(data.sentences[1].label).toBe("negative");
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("returns 502 when OpenAI returns malformed JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "Hello world.", mode: "llm" }));
    expect(res.status).toBe(502);
  });

  it("returns 400 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "Hello world.", mode: "llm" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/OPENAI_API_KEY/);
  });
});

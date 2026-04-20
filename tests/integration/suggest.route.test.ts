import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function loadRoute() {
  return await import("@/app/api/suggest/route");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/suggest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/suggest", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  it("rejects invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects when Zod validation fails (missing targetScore)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ sentence: "hello" }));
    expect(res.status).toBe(400);
  });

  it("returns suggestions when the model replies with valid JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { text: "We shipped it, and it felt great.", predictedScore: 0.8 },
                { text: "We shipped it proudly.", predictedScore: 0.6 },
                { text: "Shipping felt rewarding.", predictedScore: 0.7 },
              ],
            }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({
        sentence: "We shipped it.",
        targetScore: 0.7,
        n: 3,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toHaveLength(3);
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("retries once with a stricter reminder when the first reply is malformed", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [{ text: "Rewritten.", predictedScore: 0.5 }],
            }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ sentence: "Something.", targetScore: 0.5, n: 1 }),
    );
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);
    const data = await res.json();
    expect(data.suggestions[0].text).toBe("Rewritten.");
  });

  it("returns 502 after two malformed replies", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "still not json" } }],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ sentence: "Something.", targetScore: 0.5, n: 1 }),
    );
    expect(res.status).toBe(502);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("trims suggestions to the requested n", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { text: "one", predictedScore: 0.1 },
                { text: "two", predictedScore: 0.2 },
                { text: "three", predictedScore: 0.3 },
                { text: "four", predictedScore: 0.4 },
                { text: "five", predictedScore: 0.5 },
              ],
            }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ sentence: "s", targetScore: 0.5, n: 2 }),
    );
    const data = await res.json();
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].text).toBe("one");
    expect(data.suggestions[1].text).toBe("two");
  });

  it("returns 400 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ sentence: "s", targetScore: 0, n: 1 }),
    );
    expect(res.status).toBe(400);
  });
});

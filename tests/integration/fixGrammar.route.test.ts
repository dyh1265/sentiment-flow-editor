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
  return await import("@/app/api/fix-grammar/route");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/fix-grammar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/fix-grammar", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  it("rejects invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/fix-grammar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects when text is missing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns corrected text when the model replies with valid JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: "He doesn't like it. She's right.",
            }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(
      postRequest({ text: "He dont like it. Shes right." }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe("He doesn't like it. She's right.");
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
            content: JSON.stringify({ text: "Fixed text." }),
          },
        },
      ],
    });
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "Somthing wrong here" }));
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);
    const data = await res.json();
    expect(data.text).toBe("Fixed text.");
  });

  it("returns 502 after two malformed replies", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "still not json" } }],
    });
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "anything" }));
    expect(res.status).toBe(502);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ text: "anything" }));
    expect(res.status).toBe(400);
  });
});

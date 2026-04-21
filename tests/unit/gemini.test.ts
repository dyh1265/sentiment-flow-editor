import { beforeEach, describe, expect, it, vi } from "vitest";

function installLocalStorage(entries: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(entries));
  (globalThis as unknown as { window: unknown }).window = {
    location: { origin: "http://localhost:3000" },
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  };
}

async function loadChat() {
  return await import("@/lib/client/chat");
}

function okResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    statusText: "Error",
    headers: { "content-type": "application/json" },
  });
}

describe("Gemini REST adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    installLocalStorage({
      "sfe.provider": "gemini",
      "sfe.gemini.apiKey": "AIza-test",
      "sfe.gemini.model": "gemini-2.5-flash-lite",
    });
  });

  it("calls the Gemini generateContent endpoint with auth header and flattened system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok-response"));
    vi.stubGlobal("fetch", fetchMock);

    const { chat } = await loadChat();
    const result = await chat(
      [
        { role: "system", content: "SYS_A" },
        { role: "system", content: "SYS_B" },
        { role: "user", content: "hello" },
      ],
      { temperature: 0.3, jsonMode: true },
    );

    expect(result).toBe("ok-response");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("AIza-test");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "SYS_A\n\nSYS_B" }],
    });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
    expect(body.generationConfig).toEqual({
      temperature: 0.3,
      responseMimeType: "application/json",
    });
  });

  it("maps assistant messages to role=model in the contents array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("x"));
    vi.stubGlobal("fetch", fetchMock);
    const { chat } = await loadChat();
    await chat(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "more" },
      ],
      { temperature: 0 },
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "model", parts: [{ text: "hello" }] },
      { role: "user", parts: [{ text: "more" }] },
    ]);
    // No jsonMode => no responseMimeType
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    // No system messages => no systemInstruction
    expect(body.systemInstruction).toBeUndefined();
  });

  it("surfaces Gemini's error.message on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(429, "Resource exhausted.")),
    );
    const { chat } = await loadChat();
    await expect(
      chat([{ role: "user", content: "x" }], { temperature: 0 }),
    ).rejects.toThrow(/Resource exhausted/);
  });

  it("concatenates candidate parts into a single string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "hello " }, { text: "world" }, {}],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { chat } = await loadChat();
    const result = await chat(
      [{ role: "user", content: "x" }],
      { temperature: 0 },
    );
    expect(result).toBe("hello world");
  });

  it("throws MissingApiKeyError when no Gemini key is saved", async () => {
    installLocalStorage({ "sfe.provider": "gemini" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { chat } = await loadChat();
    await expect(
      chat([{ role: "user", content: "x" }], { temperature: 0 }),
    ).rejects.toThrow(/Google Gemini API key is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

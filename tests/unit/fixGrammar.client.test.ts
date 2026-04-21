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

// Minimal localStorage shim so the apiKey module can run in vitest's node env.
function installLocalStorage(entries: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(entries));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  };
}

async function loadFixGrammar() {
  return await import("@/lib/client/fixGrammar");
}

describe("fixGrammar (client)", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    installLocalStorage({
      "sfe.openai.apiKey": "test-key",
      "sfe.openai.model": "gpt-4o-mini",
    });
  });

  it("returns corrected text when the model replies with valid JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ text: "He doesn't like it. She's right." }),
          },
        },
      ],
    });
    const { fixGrammar } = await loadFixGrammar();
    const result = await fixGrammar({ text: "He dont like it. Shes right." });
    expect(result.text).toBe("He doesn't like it. She's right.");
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("retries once with a stricter reminder when the first reply is malformed", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ text: "Fixed text." }) } }],
    });
    const { fixGrammar } = await loadFixGrammar();
    const result = await fixGrammar({ text: "Somthing wrong here" });
    expect(result.text).toBe("Fixed text.");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two malformed replies", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "still not json" } }],
    });
    const { fixGrammar } = await loadFixGrammar();
    await expect(fixGrammar({ text: "anything" })).rejects.toThrow(
      /did not return corrected text/i,
    );
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws MissingApiKeyError when no key is configured", async () => {
    installLocalStorage({});
    vi.resetModules();
    const { fixGrammar } = await loadFixGrammar();
    await expect(fixGrammar({ text: "anything" })).rejects.toThrow(
      /api key is not configured/i,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

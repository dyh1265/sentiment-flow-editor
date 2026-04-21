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

async function loadSuggest() {
  return await import("@/lib/client/suggest");
}

describe("suggestRewrites (client)", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    installLocalStorage({
      "sfe.openai.apiKey": "test-key",
      "sfe.openai.model": "gpt-4o-mini",
    });
  });

  it("returns exactly n suggestions from a well-formed reply", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { text: "A brighter take.", predictedScore: 0.7 },
                { text: "Another angle.", predictedScore: 0.6 },
                { text: "Third option.", predictedScore: 0.5 },
              ],
            }),
          },
        },
      ],
    });
    const { suggestRewrites } = await loadSuggest();
    const result = await suggestRewrites({
      sentence: "It was bad.",
      targetScore: 0.7,
      n: 3,
    });
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0]?.text).toBe("A brighter take.");
  });

  it("retries once when the first reply is malformed", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "nope" } }],
    });
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [{ text: "ok.", predictedScore: 0.3 }],
            }),
          },
        },
      ],
    });
    const { suggestRewrites } = await loadSuggest();
    const result = await suggestRewrites({
      sentence: "Meh.",
      targetScore: 0.3,
      n: 1,
    });
    expect(result.suggestions).toHaveLength(1);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("throws when no API key is saved", async () => {
    installLocalStorage({});
    vi.resetModules();
    const { suggestRewrites } = await loadSuggest();
    await expect(
      suggestRewrites({ sentence: "x", targetScore: 0, n: 1 }),
    ).rejects.toThrow(/api key is not configured/i);
  });
});

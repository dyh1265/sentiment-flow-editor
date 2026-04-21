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

async function loadLLM() {
  return await import("@/lib/sentiment/llm");
}

describe("scoreTextLLM (client)", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.resetModules();
    installLocalStorage({
      "sfe.openai.apiKey": "test-key",
      "sfe.openai.model": "gpt-4o-mini",
    });
  });

  it("returns one scored sentence per input, preserving offsets", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sentences: [
                { index: 0, score: -0.4 },
                { index: 1, score: 0.6 },
              ],
            }),
          },
        },
      ],
    });
    const { scoreTextLLM } = await loadLLM();
    const result = await scoreTextLLM("It was bad. Then it got better.");
    expect(result).toHaveLength(2);
    expect(result[0]?.score).toBeCloseTo(-0.4, 5);
    expect(result[0]?.label).toBe("negative");
    expect(result[1]?.score).toBeCloseTo(0.6, 5);
    expect(result[1]?.label).toBe("positive");
    expect(result[1]?.start).toBeGreaterThan(result[0]!.end - 1);
  });

  it("fills missing indexes with a neutral score rather than dropping sentences", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ sentences: [{ index: 0, score: 0.2 }] }),
          },
        },
      ],
    });
    const { scoreTextLLM } = await loadLLM();
    const result = await scoreTextLLM("First. Second. Third.");
    expect(result).toHaveLength(3);
    expect(result[1]?.score).toBe(0);
    expect(result[2]?.score).toBe(0);
  });

  it("parses JSON wrapped in a markdown code fence (OpenRouter free-tier failure mode)", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              '```json\n{"sentences":[{"index":0,"score":-0.3}]}\n```',
          },
        },
      ],
    });
    const { scoreTextLLM } = await loadLLM();
    const result = await scoreTextLLM("It was bad.");
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBeCloseTo(-0.3, 5);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("parses JSON embedded inside preamble prose without retrying", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              'Here is the analysis: {"sentences":[{"index":0,"score":0.5}]}. Hope that helps!',
          },
        },
      ],
    });
    const { scoreTextLLM } = await loadLLM();
    const result = await scoreTextLLM("Everything went great.");
    expect(result[0]?.score).toBeCloseTo(0.5, 5);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("retries once with a strict reminder when the first reply is unparseable", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: "definitely not json at all" } }],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentences: [{ index: 0, score: 0.1 }],
              }),
            },
          },
        ],
      });
    const { scoreTextLLM } = await loadLLM();
    const result = await scoreTextLLM("One sentence only.");
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBeCloseTo(0.1, 5);
    expect(createMock).toHaveBeenCalledTimes(2);
    // The retry should have carried a corrective system nudge.
    const secondCallMessages = createMock.mock.calls[1][0].messages;
    expect(secondCallMessages.some((m: { content: string }) => /valid JSON/i.test(m.content))).toBe(true);
  });

  it("throws after both attempts fail, so the hook can fall back to local", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: "garbage one" } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "garbage two" } }],
      });
    const { scoreTextLLM } = await loadLLM();
    await expect(scoreTextLLM("hello")).rejects.toThrow(/valid sentiment JSON/i);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

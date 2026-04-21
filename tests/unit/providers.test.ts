import { beforeEach, describe, expect, it, vi } from "vitest";

type OpenAIArgs = {
  apiKey: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  dangerouslyAllowBrowser?: boolean;
};

const createMock = vi.fn();
const ctorSpy = vi.fn();
vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    constructor(opts: OpenAIArgs) {
      ctorSpy(opts);
    }
  }
  return { default: MockOpenAI };
});

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

async function loadClient() {
  return await import("@/lib/client/openaiClient");
}

describe("provider routing", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorSpy.mockReset();
    vi.resetModules();
  });

  it("defaults to OpenAI with no baseURL override", async () => {
    installLocalStorage({
      "sfe.openai.apiKey": "sk-openai",
      "sfe.openai.model": "gpt-4o-mini",
    });
    const { getBrowserOpenAIClient } = await loadClient();
    const { model, provider } = getBrowserOpenAIClient();
    expect(provider).toBe("openai");
    expect(model).toBe("gpt-4o-mini");
    expect(ctorSpy).toHaveBeenCalledOnce();
    const opts = ctorSpy.mock.calls[0]![0] as OpenAIArgs;
    expect(opts.apiKey).toBe("sk-openai");
    expect(opts.baseURL).toBeUndefined();
    expect(opts.defaultHeaders).toBeUndefined();
    expect(opts.dangerouslyAllowBrowser).toBe(true);
  });

  it("points at the Groq base URL when groq is active", async () => {
    installLocalStorage({
      "sfe.provider": "groq",
      "sfe.groq.apiKey": "gsk_test",
      "sfe.groq.model": "llama-3.3-70b-versatile",
    });
    const { getBrowserOpenAIClient } = await loadClient();
    const { provider, model } = getBrowserOpenAIClient();
    expect(provider).toBe("groq");
    expect(model).toBe("llama-3.3-70b-versatile");
    const opts = ctorSpy.mock.calls[0]![0] as OpenAIArgs;
    expect(opts.apiKey).toBe("gsk_test");
    expect(opts.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(opts.defaultHeaders).toBeUndefined();
  });

  it("sends attribution headers for OpenRouter", async () => {
    installLocalStorage({
      "sfe.provider": "openrouter",
      "sfe.openrouter.apiKey": "sk-or-test",
      "sfe.openrouter.model": "meta-llama/llama-3.3-70b-instruct:free",
    });
    const { getBrowserOpenAIClient } = await loadClient();
    const { provider } = getBrowserOpenAIClient();
    expect(provider).toBe("openrouter");
    const opts = ctorSpy.mock.calls[0]![0] as OpenAIArgs;
    expect(opts.apiKey).toBe("sk-or-test");
    expect(opts.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(opts.defaultHeaders).toMatchObject({
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Sentiment Flow Editor",
    });
  });

  it("throws a provider-scoped MissingApiKeyError when the active provider has no key", async () => {
    installLocalStorage({ "sfe.provider": "groq" });
    const { getBrowserOpenAIClient } = await loadClient();
    expect(() => getBrowserOpenAIClient()).toThrow(/Groq API key is not configured/);
  });

  it("points the OpenAI SDK at the user-supplied base URL for the custom provider", async () => {
    installLocalStorage({
      "sfe.provider": "custom",
      "sfe.custom.apiKey": "sk-or-custom",
      "sfe.custom.model": "deepseek/deepseek-chat-v3-0324",
      "sfe.custom.baseURL": "https://openrouter.ai/api/v1",
    });
    const { getBrowserOpenAIClient } = await loadClient();
    const { provider, model } = getBrowserOpenAIClient();
    expect(provider).toBe("custom");
    expect(model).toBe("deepseek/deepseek-chat-v3-0324");
    const opts = ctorSpy.mock.calls[0]![0] as OpenAIArgs;
    expect(opts.apiKey).toBe("sk-or-custom");
    expect(opts.baseURL).toBe("https://openrouter.ai/api/v1");
    // Attribution headers are only sent for the dedicated openrouter provider;
    // custom stays vanilla so it works with Together / Mistral / Ollama too.
    expect(opts.defaultHeaders).toBeUndefined();
  });

  it("refuses to build a custom-provider client without a base URL", async () => {
    installLocalStorage({
      "sfe.provider": "custom",
      "sfe.custom.apiKey": "sk-or-custom",
      "sfe.custom.model": "x",
    });
    const { getBrowserOpenAIClient } = await loadClient();
    expect(() => getBrowserOpenAIClient()).toThrow(/base URL/i);
    expect(ctorSpy).not.toHaveBeenCalled();
  });

  it("keeps per-provider keys isolated when switching active provider", async () => {
    installLocalStorage({
      "sfe.provider": "openai",
      "sfe.openai.apiKey": "sk-openai",
      "sfe.groq.apiKey": "gsk_groq",
    });
    const clientA = await loadClient();
    const a = clientA.getBrowserOpenAIClient();
    expect(a.provider).toBe("openai");

    // Flip the active provider by mutating localStorage then rebuild the
    // module graph so loadSettings() re-reads window.localStorage.
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(
      "sfe.provider",
      "groq",
    );
    vi.resetModules();
    const clientB = await loadClient();
    const b = clientB.getBrowserOpenAIClient();
    expect(b.provider).toBe("groq");
    const opts = ctorSpy.mock.calls[1]![0] as OpenAIArgs;
    expect(opts.apiKey).toBe("gsk_groq");
  });
});

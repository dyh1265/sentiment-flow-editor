"use client";

/**
 * Local-only storage of the user's LLM provider choice, API keys, and model
 * selections. Keys never leave the browser \u2014 every LLM call is made
 * directly from the browser to the provider's API using the saved key.
 *
 * Storage layout:
 *   sfe.provider                     "openai" | "groq" | "openrouter"
 *   sfe.openai.apiKey / .model       per-provider credentials
 *   sfe.groq.apiKey   / .model
 *   sfe.openrouter.apiKey / .model
 *
 * Per-provider buckets let a user keep keys for multiple providers saved and
 * switch between them without re-typing.
 *
 * Security note: localStorage is readable by any JavaScript running on this
 * origin. We keep the bundle small and audited to reduce XSS surface, but the
 * user should understand this tradeoff before saving a key.
 */

export type Provider = "openai" | "groq" | "openrouter" | "gemini" | "custom";

export interface ProviderConfig {
  id: Provider;
  label: string;
  /** Base URL for the OpenAI-compatible API. Leave undefined for the OpenAI SDK default. */
  baseURL?: string;
  /** Model used when no user selection is saved. */
  defaultModel: string;
  /** Suggested models. The UI also allows typing a custom id. */
  modelOptions: string[];
  /** Where to sign up / grab a key. */
  signupUrl: string;
  /** Short free-tier blurb shown in Settings. */
  costBlurb: string;
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    modelOptions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    signupUrl: "https://platform.openai.com/api-keys",
    costBlurb: "Paid. Reliable JSON mode. Well-calibrated for this app's prompts.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    modelOptions: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "deepseek-r1-distill-llama-70b",
      "qwen-2.5-32b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ],
    signupUrl: "https://console.groq.com/keys",
    costBlurb: "Free tier with rate limits (~30 RPM, daily token cap). Very fast.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    modelOptions: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "deepseek/deepseek-chat-v3-0324:free",
      "google/gemini-2.0-flash-exp:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "nvidia/llama-3.1-nemotron-70b-instruct:free",
    ],
    signupUrl: "https://openrouter.ai/keys",
    costBlurb:
      "One key for many models. Look for the :free suffix; those models have daily caps.",
  },
  gemini: {
    id: "gemini",
    // Gemini does not speak OpenAI's wire protocol; see src/lib/client/chat.ts
    // for the REST adapter. baseURL stays undefined so anything importing the
    // OpenAI SDK factory with a Gemini active provider fails loudly.
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash-lite",
    modelOptions: [
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    signupUrl: "https://aistudio.google.com/apikey",
    costBlurb:
      "Generous free tier (~15 RPM, ~1M tokens/day on flash-lite). Your own quota, not a shared pool.",
  },
  custom: {
    id: "custom",
    // The user supplies their own base URL. Any OpenAI-compatible endpoint
    // works: OpenRouter, Together AI, Mistral, Cerebras, Fireworks, a local
    // Ollama, LM Studio, or a self-hosted proxy.
    label: "Custom (OpenAI-compatible)",
    defaultModel: "",
    modelOptions: [
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat-v3-0324",
      "mistralai/mistral-large-latest",
      "llama3.2",
    ],
    signupUrl: "https://openrouter.ai/api/v1",
    costBlurb:
      "You supply the base URL. Works with any OpenAI-compatible endpoint \u2014 e.g. point the SDK at openrouter.ai/api/v1 to reuse an OpenRouter key.",
  },
};

const PROVIDER_KEY = "sfe.provider";
const CUSTOM_BASE_URL_KEY = "sfe.custom.baseURL";
const DEFAULT_PROVIDER: Provider = "openai";

export interface LLMSettings {
  provider: Provider;
  apiKey: string | null;
  model: string;
  baseURL?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function storageKeys(provider: Provider): { api: string; model: string } {
  return { api: `sfe.${provider}.apiKey`, model: `sfe.${provider}.model` };
}

function readProvider(): Provider {
  if (!isBrowser()) return DEFAULT_PROVIDER;
  const raw = window.localStorage.getItem(PROVIDER_KEY);
  if (raw && raw in PROVIDERS) return raw as Provider;
  return DEFAULT_PROVIDER;
}

function readCustomBaseURL(): string | undefined {
  if (!isBrowser()) return undefined;
  return window.localStorage.getItem(CUSTOM_BASE_URL_KEY) || undefined;
}

/** Load settings for the currently active provider. */
export function loadSettings(): LLMSettings {
  const provider = readProvider();
  const cfg = PROVIDERS[provider];
  if (!isBrowser()) {
    return { provider, apiKey: null, model: cfg.defaultModel, baseURL: cfg.baseURL };
  }
  const { api, model } = storageKeys(provider);
  const apiKey = window.localStorage.getItem(api);
  const savedModel = window.localStorage.getItem(model);
  const baseURL = provider === "custom" ? readCustomBaseURL() : cfg.baseURL;
  return {
    provider,
    apiKey: apiKey || null,
    model: savedModel || cfg.defaultModel,
    baseURL,
  };
}

/** Load the saved key + model for a specific provider, without switching active. */
export function loadProviderSettings(provider: Provider): {
  apiKey: string | null;
  model: string;
  baseURL?: string;
} {
  const cfg = PROVIDERS[provider];
  if (!isBrowser()) return { apiKey: null, model: cfg.defaultModel };
  const { api, model } = storageKeys(provider);
  return {
    apiKey: window.localStorage.getItem(api) || null,
    model: window.localStorage.getItem(model) || cfg.defaultModel,
    baseURL: provider === "custom" ? readCustomBaseURL() : cfg.baseURL,
  };
}

/** Persist key + model (and optional custom baseURL) for the given provider and make it the active one. */
export function saveSettings(input: {
  provider: Provider;
  apiKey: string | null;
  model: string;
  /** Only meaningful for provider === "custom"; ignored otherwise. */
  baseURL?: string | null;
}): void {
  if (!isBrowser()) return;
  const { provider, apiKey, model, baseURL } = input;
  const cfg = PROVIDERS[provider];
  const { api, model: modelKey } = storageKeys(provider);

  if (apiKey) window.localStorage.setItem(api, apiKey);
  else window.localStorage.removeItem(api);

  window.localStorage.setItem(modelKey, model || cfg.defaultModel);
  window.localStorage.setItem(PROVIDER_KEY, provider);

  if (provider === "custom") {
    if (baseURL && baseURL.trim()) {
      window.localStorage.setItem(CUSTOM_BASE_URL_KEY, baseURL.trim());
    } else {
      window.localStorage.removeItem(CUSTOM_BASE_URL_KEY);
    }
  }
}

/** Clear the key for a single provider (keeps the model selection). */
export function clearProviderKey(provider: Provider): void {
  if (!isBrowser()) return;
  const { api } = storageKeys(provider);
  window.localStorage.removeItem(api);
}

/** Wipe everything this app stores in localStorage. */
export function clearSettings(): void {
  if (!isBrowser()) return;
  (Object.keys(PROVIDERS) as Provider[]).forEach((p) => {
    const { api, model } = storageKeys(p);
    window.localStorage.removeItem(api);
    window.localStorage.removeItem(model);
  });
  window.localStorage.removeItem(PROVIDER_KEY);
  window.localStorage.removeItem(CUSTOM_BASE_URL_KEY);
}

export const DEFAULT_OPENAI_MODEL = PROVIDERS.openai.defaultModel;

export class MissingApiKeyError extends Error {
  constructor(public readonly provider: Provider) {
    const label = PROVIDERS[provider].label;
    super(`${label} API key is not configured. Open Settings to add your key.`);
    this.name = "MissingApiKeyError";
  }
}

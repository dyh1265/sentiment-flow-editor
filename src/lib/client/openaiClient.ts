"use client";

import OpenAI from "openai";
import { loadSettings, MissingApiKeyError, type Provider } from "./apiKey";

/**
 * Construct a browser-safe OpenAI-compatible client using the user's key for
 * the currently-active provider. Each call builds a fresh client so a provider
 * or key change in Settings takes effect immediately without any pub/sub
 * plumbing.
 *
 * OpenAI / Groq / OpenRouter all speak the same wire protocol, so we only need
 * to swap `baseURL` (and attach OpenRouter's optional attribution headers).
 */
export function getBrowserOpenAIClient(): {
  client: OpenAI;
  model: string;
  provider: Provider;
} {
  const { provider, apiKey, model, baseURL } = loadSettings();
  if (!apiKey) throw new MissingApiKeyError(provider);
  if (provider === "gemini") {
    // Defense in depth: Gemini is not OpenAI-compatible. Callers should go
    // through chat() in chat.ts which dispatches correctly.
    throw new Error(
      "Gemini does not speak the OpenAI protocol; route through chat() instead.",
    );
  }
  if (provider === "custom" && !baseURL) {
    throw new Error(
      "Custom provider requires a base URL. Open Settings and paste an OpenAI-compatible endpoint (for example, https://openrouter.ai/api/v1).",
    );
  }

  const defaultHeaders: Record<string, string> | undefined =
    provider === "openrouter"
      ? {
          // Optional attribution headers. Safe to send from the browser.
          "HTTP-Referer":
            typeof window !== "undefined" ? window.location.origin : "",
          "X-Title": "Sentiment Flow Editor",
        }
      : undefined;

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders,
    // Required: the SDK refuses browser usage by default to prevent
    // accidentally leaking server-side keys. In this app the key belongs to
    // the user and never leaves their machine, so the guard doesn't apply.
    dangerouslyAllowBrowser: true,
  });

  return { client, model, provider };
}

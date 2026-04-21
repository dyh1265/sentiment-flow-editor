"use client";

import { loadSettings, MissingApiKeyError, type Provider } from "./apiKey";
import { getBrowserOpenAIClient } from "./openaiClient";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature: number;
  /** Ask the model for strict JSON. Honored as response_format or responseMimeType. */
  jsonMode?: boolean;
}

/**
 * Provider-agnostic chat completion. Returns the first candidate's text
 * content as a plain string. Upstream callers are responsible for parsing
 * JSON and retrying on malformed output.
 *
 * OpenAI / Groq / OpenRouter all go through the OpenAI SDK path; Gemini is
 * a direct REST call against Google's Generative Language API, which does
 * not speak the OpenAI wire protocol.
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const settings = loadSettings();
  if (!settings.apiKey) throw new MissingApiKeyError(settings.provider);

  if (settings.provider === "gemini") {
    return chatGemini(messages, options, settings.apiKey, settings.model);
  }
  return chatOpenAICompatible(messages, options);
}

async function chatOpenAICompatible(
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const { client, model } = getBrowserOpenAIClient();
  const completion = await client.chat.completions.create({
    model,
    temperature: options.temperature,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages,
  });
  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Gemini REST adapter. Flattens multiple system messages into a single
 * systemInstruction (Gemini only supports one) and splits user/assistant
 * turns into the contents array.
 *
 * Auth uses the `x-goog-api-key` header, which Google's CORS policy permits
 * from browser origins.
 */
async function chatGemini(
  messages: ChatMessage[],
  options: ChatOptions,
  apiKey: string,
  model: string,
): Promise<string> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body = {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
    generationConfig: {
      temperature: options.temperature,
      ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Try to surface Gemini's structured error if present.
    let detail = `${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) detail = err.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Gemini request failed: ${detail}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

export type { Provider };

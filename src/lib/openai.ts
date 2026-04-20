import OpenAI from "openai";

let client: OpenAI | null = null;

/** Lazily construct an OpenAI client so build-time imports don't require the key. */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local to use LLM features.");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

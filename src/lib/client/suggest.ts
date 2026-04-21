"use client";

import {
  SuggestRequestSchema,
  SuggestResponseSchema,
  type SuggestRequest,
  type SuggestResponse,
} from "@/lib/schemas";
import { chat, type ChatMessage } from "./chat";
import { extractJson } from "./extractJson";

const SYSTEM_PROMPT = [
  "You rewrite a single sentence to shift its emotional sentiment toward a target score in [-1, 1].",
  "Rules: preserve the sentence's original meaning, entities, tense, and point of view.",
  "Do not add new facts or change what the sentence asserts; only change tone and word choice.",
  "Return strict JSON matching this schema:",
  `{"suggestions":[{"text": string, "predictedScore": number between -1 and 1}]}`,
  "Return exactly the requested number of suggestions. Output JSON only, no prose.",
].join(" ");

const STRICT_REMINDER =
  "Your previous reply was not valid JSON matching the schema. Respond with ONLY a JSON object " +
  `of the form {"suggestions":[{"text":"...","predictedScore":0.5}]}.`;

/**
 * Generate rewrite suggestions for a single sentence, aimed at a target score.
 * Calls the active provider directly from the browser.
 */
export async function suggestRewrites(req: SuggestRequest): Promise<SuggestResponse> {
  const parsed = SuggestRequestSchema.parse(req);
  const userPayload = JSON.stringify({
    sentence: parsed.sentence,
    before: parsed.before ?? "",
    after: parsed.after ?? "",
    targetScore: parsed.targetScore,
    n: parsed.n,
  });

  const buildMessages = (extraSystem?: string): ChatMessage[] => [
    { role: "system", content: SYSTEM_PROMPT },
    ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
    { role: "user", content: userPayload },
  ];

  const tryParse = (raw: string): SuggestResponse | null => {
    const json = extractJson(raw);
    if (json === null) return null;
    const res = SuggestResponseSchema.safeParse(json);
    return res.success ? res.data : null;
  };

  let raw = await chat(buildMessages(), { temperature: 0.7, jsonMode: true });
  let result = tryParse(raw);
  if (!result) {
    raw = await chat(buildMessages(STRICT_REMINDER), {
      temperature: 0.7,
      jsonMode: true,
    });
    result = tryParse(raw);
  }
  if (!result) {
    throw new Error("Model did not return valid suggestions");
  }
  return { suggestions: result.suggestions.slice(0, parsed.n) };
}

"use client";

import {
  FixGrammarRequestSchema,
  FixGrammarResponseSchema,
  type FixGrammarRequest,
  type FixGrammarResponse,
} from "@/lib/schemas";
import { chat, type ChatMessage } from "./chat";
import { extractJson } from "./extractJson";

const SYSTEM_PROMPT = [
  "You are a careful copy editor. Fix only grammar, spelling, punctuation, capitalization, and obvious typos in the user's text.",
  "Preserve the author's meaning, voice, tone, sentence structure, and emotional sentiment.",
  "Do not rewrite for style, do not reorder sentences, do not add or remove content, and do not translate.",
  "Keep paragraph breaks exactly as given.",
  'Return strict JSON of the form {"text": "<corrected text>"}.',
  "Output JSON only, no prose, no code fences.",
].join(" ");

const STRICT_REMINDER =
  "Your previous reply was not valid JSON matching the schema. Respond with ONLY a JSON object " +
  'of the form {"text":"..."} containing the corrected text.';

/**
 * Copy-edit the user's text for grammar, spelling, and punctuation while
 * preserving meaning, tone, and sentiment. Runs entirely in the browser.
 */
export async function fixGrammar(req: FixGrammarRequest): Promise<FixGrammarResponse> {
  const parsed = FixGrammarRequestSchema.parse(req);

  const buildMessages = (extraSystem?: string): ChatMessage[] => [
    { role: "system", content: SYSTEM_PROMPT },
    ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
    { role: "user", content: parsed.text },
  ];

  const tryParse = (raw: string): FixGrammarResponse | null => {
    const json = extractJson(raw);
    if (json === null) return null;
    const res = FixGrammarResponseSchema.safeParse(json);
    return res.success ? res.data : null;
  };

  let raw = await chat(buildMessages(), { temperature: 0.2, jsonMode: true });
  let result = tryParse(raw);
  if (!result) {
    raw = await chat(buildMessages(STRICT_REMINDER), {
      temperature: 0.2,
      jsonMode: true,
    });
    result = tryParse(raw);
  }
  if (!result) {
    throw new Error("Model did not return corrected text");
  }
  return result;
}

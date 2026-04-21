"use client";

import { z } from "zod";
import { splitSentences } from "@/lib/splitSentences";
import { chat, type ChatMessage } from "@/lib/client/chat";
import { extractJson } from "@/lib/client/extractJson";
import { clampScore, labelForScore, type ScoredSentence } from "./types";

const LLMResponseSchema = z.object({
  sentences: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        score: z.number().min(-1).max(1),
      }),
    )
    .min(1),
});

const SYSTEM_PROMPT = [
  "You are a precise sentiment scorer. You receive a numbered list of sentences and return a JSON object",
  "matching the schema { sentences: [{ index: number, score: number in [-1,1] }] }.",
  "",
  "Calibration (use the full continuous scale, not just the extremes):",
  "  -1.0 to -0.8  intense negativity: grief, rage, despair, horror",
  "  -0.7 to -0.4  clearly negative: sadness, frustration, disappointment",
  "  -0.3 to -0.1  mildly negative: dull, flat, uneasy, slightly off",
  "  -0.1 to +0.1  neutral or factual, or mixed/ambivalent with no clear lean",
  "  +0.1 to +0.3  mildly positive: pleasant, content, gently hopeful",
  "  +0.4 to +0.7  clearly positive: happy, warm, affectionate, optimistic",
  "  +0.8 to +1.0  intense positivity: awe, ecstasy, euphoria, triumph",
  "",
  "Rules of thumb:",
  "- Most sentences in ordinary prose land between -0.6 and +0.6. Reserve |score| >= 0.9 for rare, unambiguous extremes.",
  "- A single strong word (love, painfully, glowing, dragged) does NOT automatically mean an extreme score. Read the full sentence in context.",
  "- Gentle melancholy is ~-0.3, not -0.9. Quiet contentment is ~+0.3, not +0.9.",
  "- Mixed sentences (positive + negative elements) average toward the middle.",
  "",
  "Return one entry per input sentence, preserve input indexes, and output JSON only.",
].join("\n");

const STRICT_REMINDER =
  "Your previous reply was not valid JSON matching the schema. Respond with ONLY a JSON object " +
  'of the form {"sentences":[{"index":0,"score":0.0}]} — no code fences, no prose.';

/**
 * Score each sentence with an LLM, returning the same shape as the local
 * scorer. Routes through the active provider (OpenAI / Groq / OpenRouter /
 * Gemini) via chat(). Throws MissingApiKeyError if no key is configured.
 */
export async function scoreTextLLM(text: string): Promise<ScoredSentence[]> {
  const spans = splitSentences(text);
  if (spans.length === 0) return [];

  const userPayload = spans.map((s, i) => `${i}. ${s.text}`).join("\n");

  const buildMessages = (extraSystem?: string): ChatMessage[] => [
    { role: "system", content: SYSTEM_PROMPT },
    ...(extraSystem ? [{ role: "system" as const, content: extraSystem }] : []),
    { role: "user", content: userPayload },
  ];

  const tryParse = (
    raw: string,
  ): z.infer<typeof LLMResponseSchema> | null => {
    // extractJson tolerates markdown fences and preamble that JSON.parse
    // alone would reject — a common failure mode on OpenRouter free tier
    // and on small custom-endpoint models.
    const json = extractJson(raw);
    if (json === null) return null;
    const parsed = LLMResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  };

  let raw = await chat(buildMessages(), { temperature: 0, jsonMode: true });
  let result = tryParse(raw);
  if (!result) {
    raw = await chat(buildMessages(STRICT_REMINDER), {
      temperature: 0,
      jsonMode: true,
    });
    result = tryParse(raw);
  }
  if (!result) {
    throw new Error("LLM did not return valid sentiment JSON");
  }

  const scoreByIndex = new Map<number, number>();
  for (const entry of result.sentences) {
    scoreByIndex.set(entry.index, clampScore(entry.score));
  }

  return spans.map((span, i) => {
    const score = scoreByIndex.get(i) ?? 0;
    return {
      text: span.text,
      score,
      label: labelForScore(score),
      start: span.start,
      end: span.end,
    };
  });
}

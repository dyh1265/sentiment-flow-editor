import { z } from "zod";
import { splitSentences } from "@/lib/splitSentences";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai";
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

const SYSTEM_PROMPT =
  "You are a precise sentiment scorer. You receive a numbered list of sentences and return a JSON object " +
  "matching the schema { sentences: [{ index: number, score: number in [-1,1] }] }. " +
  "Use -1 for intensely negative and +1 for intensely positive. Neutral sentences score near 0. " +
  "Return one entry per input sentence and preserve input indexes. Output JSON only.";

/**
 * Score each sentence with an LLM, returning the same shape as the local scorer.
 * Falls back gracefully (preserves sentence list with score 0) if the model omits an entry.
 */
export async function scoreTextLLM(text: string): Promise<ScoredSentence[]> {
  const spans = splitSentences(text);
  if (spans.length === 0) return [];

  const userPayload = spans.map((s, i) => `${i}. ${s.text}`).join("\n");

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: getOpenAIModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("LLM returned non-JSON content");
  }

  const parsed = LLMResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("LLM response did not match schema");
  }

  const scoreByIndex = new Map<number, number>();
  for (const entry of parsed.data.sentences) {
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

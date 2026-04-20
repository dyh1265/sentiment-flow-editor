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

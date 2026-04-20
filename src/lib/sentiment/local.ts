import { SentimentIntensityAnalyzer } from "vader-sentiment";
import { splitSentences } from "@/lib/splitSentences";
import { clampScore, labelForScore, type ScoredSentence } from "./types";

/**
 * Score each sentence locally with VADER. Fast, deterministic, no network,
 * English-only. Compound scores are already in [-1, 1].
 */
export function scoreTextLocal(text: string): ScoredSentence[] {
  const spans = splitSentences(text);
  return spans.map((span) => {
    const { compound } = SentimentIntensityAnalyzer.polarity_scores(span.text);
    const score = clampScore(compound);
    return {
      text: span.text,
      score,
      label: labelForScore(score),
      start: span.start,
      end: span.end,
    };
  });
}

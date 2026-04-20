export type SentimentLabel = "negative" | "neutral" | "positive";

export interface ScoredSentence {
  text: string;
  /** Score in [-1, 1]. */
  score: number;
  label: SentimentLabel;
  /** Optional offsets into the original source text. */
  start?: number;
  end?: number;
}

export function labelForScore(score: number): SentimentLabel {
  if (score <= -0.2) return "negative";
  if (score >= 0.2) return "positive";
  return "neutral";
}

export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < -1) return -1;
  if (score > 1) return 1;
  return score;
}

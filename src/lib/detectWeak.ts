import type { ScoredSentenceDto } from "@/lib/schemas";

/** Default threshold: a sentence is "weak" when it deviates from target by >= 0.5 (out of 2.0 range). */
export const DEFAULT_WEAK_THRESHOLD = 0.5;

/**
 * Return the indices of sentences whose score differs from the target arc by at
 * least `threshold`. If `target` is null or lengths don't match, returns empty.
 */
export function detectWeakIndices(
  sentences: ScoredSentenceDto[],
  target: number[] | null | undefined,
  threshold: number = DEFAULT_WEAK_THRESHOLD,
): number[] {
  if (!target || target.length !== sentences.length) return [];
  const out: number[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (Math.abs(sentences[i].score - target[i]) >= threshold) out.push(i);
  }
  return out;
}

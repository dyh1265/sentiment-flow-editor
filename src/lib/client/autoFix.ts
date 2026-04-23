"use client";

import { suggestRewrites } from "./suggest";
import { scoreTextLocal } from "@/lib/sentiment/local";
import { DEFAULT_WEAK_THRESHOLD } from "@/lib/detectWeak";
import type { ScoredSentenceDto, Suggestion } from "@/lib/schemas";

/**
 * Independent reality check for a candidate rewrite. Uses VADER (the same
 * scorer the weak-detection UI uses when mode === "local") so a rewrite we
 * accept here won't be re-flagged as weak after the chart re-analyzes.
 *
 * VADER is English-only; for non-English text the score is noisy but still
 * a useful signal for "did this move at all". Falls back to 0 if VADER
 * can't extract a sentence span (defensive — shouldn't happen in practice).
 */
export function realScoreFor(text: string): number {
  const scored = scoreTextLocal(text);
  if (scored.length === 0) return 0;
  // A single rewritten sentence may split into multiple sub-sentences;
  // average across them. (A good rewrite is one full sentence, so this
  // usually equals the single score.)
  const avg =
    scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
  return avg;
}

export interface AutoFixRewrite {
  /** Sentence index in the `sentences` array. */
  index: number;
  /** Rewritten sentence text (replaces the original). */
  newText: string;
  /** LLM's claim about where this rewrite lands on [-1, 1]. */
  predictedScore: number;
}

export interface AutoFixParams {
  sentences: ScoredSentenceDto[];
  /** 0-based indices of sentences the caller wants rewritten. */
  weakIndices: number[];
  /** Target score per sentence index (only `targets[i]` for i ∈ weakIndices is read). */
  targets: number[];
  /**
   * Max concurrent LLM calls. Parallelism is nice but most free providers
   * rate-limit aggressively; 3 is a safe default that finishes quickly for
   * the typical 2-5 weak sentences without triggering 429s.
   */
  concurrency?: number;
  /**
   * How many candidates to ask for per sentence per iteration. We pick the
   * one whose predictedScore is closest to the target. 2 is enough variety
   * to avoid an off-target single reply without doubling token cost.
   */
  candidatesPerSentence?: number;
  /**
   * Per-sentence convergence loop cap. If the real (VADER-verified) score
   * of a rewrite is farther than `tolerance` from the target, we feed it
   * back to the LLM and ask again, up to `maxIterations` total attempts.
   * Keeps users from having to click Auto-fix multiple times when one
   * pass doesn't land. Default 8.
   */
  maxIterations?: number;
  /**
   * How close (in absolute score units) a rewrite's **real** VADER score
   * must land to target before we stop iterating on that sentence.
   * Default 0.4 — strictly inside the 0.5 weak threshold, so an accepted
   * rewrite has a comfortable margin and won't re-trigger the weak flag
   * after re-analysis.
   */
  tolerance?: number;
  /**
   * Which score signal drives ranking + convergence inside the iterative loop.
   * - "local": rank by VADER score (deterministic; default)
   * - "llm": rank by model predictedScore (aligns with High accuracy mode)
   */
  scorerMode?: "local" | "llm";
}

export interface AutoFixResult {
  /** Successfully rewritten sentences (may be shorter than weakIndices). */
  rewrites: AutoFixRewrite[];
  /** Indices we tried to rewrite but where every attempt failed. */
  failedIndices: number[];
  /** First error message encountered (for surfacing in the UI). */
  firstError: string | null;
}

/**
 * Orchestrates per-sentence LLM rewrites for a batch of weak sentences.
 *
 * - Runs at most `concurrency` requests in flight at once.
 * - Asks for `candidatesPerSentence` options per sentence per iteration.
 * - **Verifies each candidate with VADER** (an independent, deterministic
 *   scorer) instead of trusting the LLM's self-reported `predictedScore`.
 *   This is the fix for "it says Fixed! but the chart still shows weak" —
 *   the LLM is optimistic about its own rewrites, VADER is not.
 * - Per-sentence convergence loop: picks the candidate whose **real** score
 *   is closest to target; if still farther than `tolerance`, feeds that
 *   rewrite back as the new baseline and iterates, up to `maxIterations`
 *   total attempts.
 * - Never throws for individual failures; returns a `failedIndices` list
 *   (only entries that produced zero usable candidates across all
 *   iterations) so the caller can show a partial-success message.
 * - Throws only when pre-conditions are invalid.
 */
export async function autoFixForArc({
  sentences,
  weakIndices,
  targets,
  concurrency = 3,
  candidatesPerSentence = 3,
  maxIterations = 8,
  // Strictly inside the 0.5 weak threshold — accepted rewrites have a
  // safety margin and won't get re-flagged by the UI's weak detector.
  tolerance = DEFAULT_WEAK_THRESHOLD - 0.1,
  scorerMode = "local",
}: AutoFixParams): Promise<AutoFixResult> {
  if (weakIndices.length === 0) {
    return { rewrites: [], failedIndices: [], firstError: null };
  }

  const rewrites: AutoFixRewrite[] = [];
  const failedIndices: number[] = [];
  let firstError: string | null = null;

  const queue = [...weakIndices];
  const workers: Promise<void>[] = [];

  const runOne = async (index: number): Promise<void> => {
    const s = sentences[index];
    if (!s || targets[index] == null) {
      failedIndices.push(index);
      return;
    }
    const target = targets[index];
    const before = sentences[index - 1]?.text ?? "";
    const after = sentences[index + 1]?.text ?? "";

    // Iterative convergence, verified against a real scorer:
    //   - Ask LLM for N candidates.
    //   - Score each with VADER.
    //   - Pick the one whose REAL score is closest to target (not the
    //     LLM's self-report).
    //   - If within tolerance, accept. Otherwise feed that best attempt
    //     back in and iterate.
    //   - Stop early only if tolerance is met; otherwise keep trying up to
    //     `maxIterations` so users don't need repeated clicks.
    let currentText = s.text;
    let best: { text: string; realScore: number; predictedScore: number } | null = null;
    let attemptError: string | null = null;

    for (let iter = 0; iter < Math.max(1, maxIterations); iter++) {
      try {
        const { suggestions } = await suggestRewrites({
          sentence: currentText,
          before,
          after,
          targetScore: target,
          n: candidatesPerSentence,
        });
        if (suggestions.length === 0) continue;

        // Score every candidate with VADER and rank by real-score distance,
        // with a hard penalty for malformed text artifacts.
        const ranked = suggestions
          .map((s) => ({
            text: s.text,
            predictedScore: s.predictedScore,
            realScore: scorerMode === "llm" ? s.predictedScore : realScoreFor(s.text),
            malformed: isMalformedRewrite(s.text),
          }))
          .sort(
            (a, b) =>
              rankingScore(a.realScore, target, a.malformed) -
              rankingScore(b.realScore, target, b.malformed),
          );
        const candidate = ranked[0];
        if (candidate.malformed) continue;

        if (
          best === null ||
          Math.abs(candidate.realScore - target) <
            Math.abs(best.realScore - target)
        ) {
          best = candidate;
        }

        // Good enough — stop iterating on this sentence.
        if (Math.abs(best.realScore - target) <= tolerance) break;
        // Feed the best attempt back in for another pass.
        currentText = candidate.text;
      } catch (err) {
        attemptError =
          err instanceof Error ? err.message : "Rewrite failed";
        // Don't retry the same iteration — let the outer loop retry with
        // the same `currentText`. If every iteration throws we'll surface
        // the error below.
      }
    }

    if (!best) {
      failedIndices.push(index);
      if (firstError == null && attemptError != null) firstError = attemptError;
      return;
    }
    rewrites.push({
      index,
      newText: best.text,
      // Return the REAL score so demoOverrides and any downstream display
      // reflects what re-analysis will actually produce, not what the LLM
      // wishfully predicted.
      predictedScore: best.realScore,
    });
  };

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next == null) return;
      await runOne(next);
    }
  };

  const n = Math.max(1, Math.min(concurrency, weakIndices.length));
  for (let i = 0; i < n; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  rewrites.sort((a, b) => a.index - b.index);
  failedIndices.sort((a, b) => a - b);
  return { rewrites, failedIndices, firstError };
}

function rankingScore(
  realScore: number,
  target: number,
  malformed: boolean,
): number {
  // Big penalty so malformed outputs lose even if their sentiment is closer.
  return Math.abs(realScore - target) + (malformed ? 100 : 0);
}

/**
 * Catch obvious output corruption from iterative rewrites, e.g.:
 * - "encountered.sSlowly" (punctuation glued to next token)
 * - "manageable,eable" (comma-glued token fragments)
 * - weird camel-like seams in plain prose
 */
export function isMalformedRewrite(text: string): boolean {
  if (!text.trim()) return true;
  // punctuation should usually be followed by whitespace/end/quote/bracket
  if (/[.,;:!?](?=[A-Za-z])/g.test(text)) return true;
  // suspicious seam like "sSlowly" in normal prose
  if (/[a-z][A-Z][a-z]/.test(text)) return true;
  // control chars / replacement char indicate encoding issues
  if (/[\u0000-\u001f\u007f\ufffd]/.test(text)) return true;
  return false;
}

/**
 * Pick the suggestion whose predictedScore is closest to `target`.
 * Ties break in favor of the earlier suggestion (by array order).
 */
export function pickClosest(
  suggestions: Suggestion[],
  target: number,
): Suggestion | null {
  if (suggestions.length === 0) return null;
  let best = suggestions[0];
  let bestDelta = Math.abs(best.predictedScore - target);
  for (let i = 1; i < suggestions.length; i++) {
    const delta = Math.abs(suggestions[i].predictedScore - target);
    if (delta < bestDelta) {
      best = suggestions[i];
      bestDelta = delta;
    }
  }
  return best;
}

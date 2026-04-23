"use client";

import { useState } from "react";
import {
  autoFixForArc,
  pickClosest,
  realScoreFor,
  type AutoFixRewrite,
} from "@/lib/client/autoFix";
import { DEFAULT_WEAK_THRESHOLD } from "@/lib/detectWeak";
import type { AnalyzeMode, ScoredSentenceDto, Suggestion } from "@/lib/schemas";

interface AutoFixButtonProps {
  sentences: ScoredSentenceDto[];
  /** 0-based indices of sentences to rewrite. */
  weakIndices: number[];
  /** Target score per sentence index. */
  targets: number[];
  /** Active scoring mode; used to pick retry evaluator in multi-pass loop. */
  mode: AnalyzeMode;
  /** Human-readable arc name for the button label ("Story arc"). */
  arcLabel: string;
  /** Called with the successful rewrites (sorted by sentence index). */
  onFixed: (rewrites: AutoFixRewrite[]) => void;
  /** Called when the batch fully fails or partially fails. */
  onError?: (message: string) => void;
  /**
   * Optional canned rewrites per sentence index. When provided the button
   * skips the LLM and applies the first canned option for each weak sentence.
   * Used by demo mode.
   */
  demoRewrites?: Record<number, Suggestion[]> | null;
  className?: string;
}

/**
 * Header-level action that rewrites every weak sentence toward the active
 * target arc in one click. Reuses the per-sentence suggestRewrites machinery
 * under the hood, so prompt/provider logic stays in a single place.
 */
export function AutoFixButton({
  sentences,
  weakIndices,
  targets,
  mode,
  arcLabel,
  onFixed,
  onError,
  demoRewrites = null,
  className,
}: AutoFixButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "partial">("idle");

  const count = weakIndices.length;
  const disabled = count === 0 || state === "loading";

  const handleClick = async () => {
    if (disabled) return;
    setState("loading");

    if (demoRewrites) {
      // Demo: grab the first canned suggestion for each weak sentence. If
      // the arc doesn't have canned data for a given weak sentence we just
      // skip it silently — the user sees partial progress, which is more
      // honest than pretending everything was rewritten.
      const rewrites: AutoFixRewrite[] = [];
      for (const i of weakIndices) {
        const opts = demoRewrites[i];
        if (!opts || opts.length === 0) continue;
        const best = pickClosest(opts, targets[i] ?? 0);
        if (!best) continue;
        rewrites.push({
          index: i,
          newText: best.text,
          predictedScore: best.predictedScore,
        });
      }
      // Fake a bit of latency so the "Fixing…" → "Fixed!" transition
      // reads as real work.
      window.setTimeout(() => {
        onFixed(rewrites);
        setState("done");
        window.setTimeout(() => setState("idle"), 1500);
        if (rewrites.length < weakIndices.length) {
          onError?.(
            `Auto-fix rewrote ${rewrites.length} of ${weakIndices.length} sentences (no canned demo data for the rest).`,
          );
        }
      }, 600);
      return;
    }

    try {
      // Multi-pass loop: run Auto-fix repeatedly for remaining weak sentences.
      // This avoids forcing users to click again when pass #1 improves text but
      // doesn't fully cross the weak threshold.
      const maxPasses = mode === "llm" ? 5 : 3;
      const resolveThreshold = mode === "llm" ? 0.35 : DEFAULT_WEAK_THRESHOLD;
      const latestTextByIndex = new Map<number, string>();
      sentences.forEach((s, i) => latestTextByIndex.set(i, s.text));
      const latestScoreByIndex = new Map<number, number>();
      sentences.forEach((s, i) => latestScoreByIndex.set(i, s.score));

      const finalByIndex = new Map<number, AutoFixRewrite>();
      let pending = [...weakIndices].sort((a, b) => a - b);
      let totalFailed = 0;
      let firstError: string | null = null;

      for (let pass = 0; pass < maxPasses && pending.length > 0; pass++) {
        const working = sentences.map((s, i) => ({
          ...s,
          text: latestTextByIndex.get(i) ?? s.text,
        }));
        const { rewrites, failedIndices, firstError: passError } = await autoFixForArc({
          sentences: working,
          weakIndices: pending,
          targets,
          scorerMode: mode,
          // High-accuracy mode gets a stronger one-click push.
          maxIterations: mode === "llm" ? 12 : 8,
          candidatesPerSentence: mode === "llm" ? 4 : 3,
          tolerance: mode === "llm" ? 0.35 : DEFAULT_WEAK_THRESHOLD - 0.1,
        });
        if (passError && firstError == null) firstError = passError;
        totalFailed += failedIndices.length;

        // If this pass produced no usable rewrites, no point continuing.
        if (rewrites.length === 0) break;

        for (const r of rewrites) {
          latestTextByIndex.set(r.index, r.newText);
          latestScoreByIndex.set(r.index, r.predictedScore);
          finalByIndex.set(r.index, r);
        }

        // Recompute "still weak" from the latest rewritten text.
        const stillWeak: number[] = [];
        for (const i of pending) {
          const score =
            mode === "llm"
              ? (latestScoreByIndex.get(i) ?? 0)
              : realScoreFor(latestTextByIndex.get(i) ?? "");
          const delta = Math.abs(score - (targets[i] ?? 0));
          if (delta > resolveThreshold) stillWeak.push(i);
        }
        pending = stillWeak;
      }

      const rewrites = Array.from(finalByIndex.values()).sort((a, b) => a.index - b.index);
      if (rewrites.length === 0) {
        setState("idle");
        onError?.(firstError ?? "Auto-fix couldn't rewrite any sentences");
        return;
      }
      const unresolved = weakIndices.filter((i) => !finalByIndex.has(i)).length;
      const fullyResolved = totalFailed === 0 && unresolved === 0;
      onFixed(rewrites);
      setState(fullyResolved ? "done" : "partial");
      window.setTimeout(() => setState("idle"), fullyResolved ? 1500 : 2200);
      if (!fullyResolved) {
        onError?.(
          `Auto-fix rewrote ${rewrites.length} of ${weakIndices.length} sentences. ` +
            (unresolved > 0 ? `${unresolved} still look weak after retries. ` : "") +
            (firstError ? `First error: ${firstError}` : ""),
        );
      }
    } catch (err) {
      setState("idle");
      onError?.(err instanceof Error ? err.message : "Auto-fix failed");
    }
  };

  const label =
    state === "loading"
      ? `Fixing ${count}\u2026`
      : state === "partial"
        ? "Partially fixed"
      : state === "done"
        ? "Fixed!"
        : `Auto-fix \u2192 ${arcLabel}${count > 0 ? ` (${count})` : ""}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-live="polite"
      title={`Rewrite ${count} weak sentence${count === 1 ? "" : "s"} to hit the ${arcLabel} target curve.`}
      className={[
        "rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-100 disabled:opacity-50",
        className ?? "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

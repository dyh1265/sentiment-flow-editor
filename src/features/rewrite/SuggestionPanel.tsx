"use client";

import { useEffect, useState } from "react";
import { useSuggest } from "@/hooks/useSuggest";
import type { ScoredSentenceDto, Suggestion } from "@/lib/schemas";

interface SuggestionPanelProps {
  selected: { index: number; sentence: ScoredSentenceDto } | null;
  targetScore: number | null;
  before: string;
  after: string;
  onApply: (index: number, newText: string, predictedScore: number) => void;
  onDismiss: () => void;
  /**
   * If provided, clicking "Suggest rewrites" shows these canned options
   * instead of hitting the LLM. Used by demo mode. Pass `null` to keep the
   * normal LLM flow. An empty array is treated as "no canned data for this
   * sentence" and falls back to the LLM flow (or the locked-out message).
   */
  demoSuggestions?: Suggestion[] | null;
  /**
   * If true, hide the "Suggest rewrites" button and show a nudge pointing at
   * Settings. Used when the user has no API key AND this particular sentence
   * has no canned rewrite to fall back on.
   */
  llmLocked?: boolean;
  onOpenSettings?: () => void;
  /**
   * When provided (demo mode), the locked banner mentions which sentences
   * *do* have canned rewrites so the user knows where to click. 0-based.
   */
  scriptedIndices?: number[] | null;
}

export function SuggestionPanel({
  selected,
  targetScore,
  before,
  after,
  onApply,
  onDismiss,
  demoSuggestions = null,
  llmLocked = false,
  onOpenSettings,
  scriptedIndices = null,
}: SuggestionPanelProps) {
  const { suggestions, loading, error, fetchSuggestions, reset } = useSuggest();
  const [demoShown, setDemoShown] = useState<Suggestion[] | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  // Reset whenever the selection changes.
  useEffect(() => {
    reset();
    setDemoShown(null);
    setDemoLoading(false);
  }, [selected?.index, reset]);

  if (!selected) return null;

  const canRequest = targetScore != null;
  const hasCanned = Array.isArray(demoSuggestions) && demoSuggestions.length > 0;
  const visibleSuggestions: Suggestion[] = demoShown ?? suggestions;
  const isLoading = demoLoading || loading;

  const handleRequest = () => {
    if (hasCanned) {
      // Tiny fake latency so the "Thinking…" → results transition feels like
      // the real thing. 500ms is long enough to notice, short enough to not
      // annoy.
      setDemoLoading(true);
      window.setTimeout(() => {
        setDemoShown(demoSuggestions);
        setDemoLoading(false);
      }, 500);
      return;
    }
    fetchSuggestions({
      sentence: selected.sentence.text,
      before,
      after,
      targetScore: targetScore ?? 0,
      n: 3,
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-gray-300 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Sentence #{selected.index + 1}
          </p>
          <p className="text-sm text-gray-800">{selected.sentence.text}</p>
          <p className="mt-1 text-xs text-gray-500">
            Current: {selected.sentence.score.toFixed(2)}
            {targetScore != null ? ` \u2192 Target: ${targetScore.toFixed(2)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {llmLocked && !hasCanned ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span>{buildLockedMessage(scriptedIndices)}</span>
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Open Settings
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canRequest || isLoading}
            onClick={handleRequest}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Thinking…" : "Suggest rewrites"}
          </button>
          {!canRequest ? (
            <span className="text-xs text-gray-500">Pick a target arc to enable rewrites.</span>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {visibleSuggestions.length > 0 ? (
        <ul className="space-y-2">
          {visibleSuggestions.map((s, i) => (
            <li key={i} className="rounded-md border border-gray-200 p-3">
              <p className="text-sm text-gray-800">{s.text}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Predicted: {s.predictedScore.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => onApply(selected.index, s.text, s.predictedScore)}
                  className="rounded-md border border-blue-600 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  Apply
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Build the message shown when LLM rewrites are locked behind a missing key.
 * In demo mode (when `scriptedIndices` is a non-empty array) we point the
 * user at the sentences that *do* have canned rewrites, so clicking around
 * doesn't feel like a dead end.
 */
function buildLockedMessage(scriptedIndices: number[] | null | undefined): string {
  if (scriptedIndices && scriptedIndices.length > 0) {
    const humanIndices = scriptedIndices.map((i) => `#${i + 1}`);
    const label =
      humanIndices.length === 1
        ? humanIndices[0]
        : humanIndices.length === 2
          ? humanIndices.join(" and ")
          : `${humanIndices.slice(0, -1).join(", ")}, and ${humanIndices.at(-1)}`;
    const noun = humanIndices.length === 1 ? "sentence" : "sentences";
    return `Canned rewrites exist for ${noun} ${label}. Add an API key to rewrite any sentence.`;
  }
  return "Add an API key to generate rewrites.";
}

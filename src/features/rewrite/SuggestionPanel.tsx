"use client";

import { useEffect } from "react";
import { useSuggest } from "@/hooks/useSuggest";
import type { ScoredSentenceDto } from "@/lib/schemas";

interface SuggestionPanelProps {
  selected: { index: number; sentence: ScoredSentenceDto } | null;
  targetScore: number | null;
  before: string;
  after: string;
  onApply: (index: number, newText: string) => void;
  onDismiss: () => void;
}

export function SuggestionPanel({
  selected,
  targetScore,
  before,
  after,
  onApply,
  onDismiss,
}: SuggestionPanelProps) {
  const { suggestions, loading, error, fetchSuggestions, reset } = useSuggest();

  // Reset whenever the selection changes.
  useEffect(() => {
    reset();
  }, [selected?.index, reset]);

  if (!selected) return null;

  const canRequest = targetScore != null;

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

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canRequest || loading}
          onClick={() =>
            fetchSuggestions({
              sentence: selected.sentence.text,
              before,
              after,
              targetScore: targetScore ?? 0,
              n: 3,
            })
          }
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Suggest rewrites"}
        </button>
        {!canRequest ? (
          <span className="text-xs text-gray-500">Pick a target arc to enable rewrites.</span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {suggestions.length > 0 ? (
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i} className="rounded-md border border-gray-200 p-3">
              <p className="text-sm text-gray-800">{s.text}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Predicted: {s.predictedScore.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => onApply(selected.index, s.text)}
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

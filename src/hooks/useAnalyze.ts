"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzeMode, AnalyzeResponse } from "@/lib/schemas";
import { scoreTextLocal } from "@/lib/sentiment/local";
import { scoreTextLLM } from "@/lib/sentiment/llm";
import { MissingApiKeyError } from "@/lib/client/apiKey";

interface UseAnalyzeResult {
  sentences: AnalyzeResponse["sentences"];
  loading: boolean;
  /**
   * A non-fatal warning (e.g. LLM failed, fell back to local VADER) or a
   * fatal error (e.g. missing API key in LLM mode). The UI treats both as
   * messages to show; `sentences` is populated in the warning case so the
   * chart still renders.
   */
  error: string | null;
  mode: AnalyzeMode;
}

/**
 * Debounced analyzer. Runs entirely in the browser: local mode uses VADER,
 * LLM mode calls OpenAI directly using the user's configured key. A rising
 * "generation" counter makes stale async results get discarded in order.
 */
export function useAnalyze(
  text: string,
  mode: AnalyzeMode,
  /**
   * Incrementing counter callers can bump to force re-analysis without
   * mutating `text` or `mode` (e.g. after saving a new API key).
   */
  trigger = 0,
  debounceMs = 400,
): UseAnalyzeResult {
  const [sentences, setSentences] = useState<AnalyzeResponse["sentences"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!text.trim()) {
      setSentences([]);
      setError(null);
      setLoading(false);
      return;
    }

    const handle = setTimeout(async () => {
      const gen = ++generationRef.current;
      setLoading(true);
      setError(null);
      try {
        const result =
          mode === "llm" ? await scoreTextLLM(text) : scoreTextLocal(text);
        if (gen === generationRef.current) setSentences(result);
      } catch (err) {
        if (gen !== generationRef.current) return;
        // Missing API key is unrecoverable without user action — surface it
        // and leave the chart empty so the hint is impossible to miss.
        if (err instanceof MissingApiKeyError) {
          setError(err.message);
          setSentences([]);
          return;
        }
        // Every other LLM-mode failure (parse error, network, rate limit,
        // schema mismatch) gets a graceful fall back to local VADER so the
        // chart still renders. The warning text tells the user why.
        if (mode === "llm") {
          const reason = err instanceof Error ? err.message : "LLM analyze failed";
          try {
            const fallback = scoreTextLocal(text);
            if (gen === generationRef.current) {
              setSentences(fallback);
              setError(`${reason}. Showing local VADER scores as a fallback.`);
            }
            return;
          } catch {
            // Local scoring shouldn't really fail, but if it does we fall
            // through to the generic error path below.
          }
        }
        const message = err instanceof Error ? err.message : "Analyze failed";
        setError(message);
        setSentences([]);
      } finally {
        if (gen === generationRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [text, mode, trigger, debounceMs]);

  return { sentences, loading, error, mode };
}

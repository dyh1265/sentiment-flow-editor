"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzeMode, AnalyzeResponse } from "@/lib/schemas";

interface UseAnalyzeResult {
  sentences: AnalyzeResponse["sentences"];
  loading: boolean;
  error: string | null;
  mode: AnalyzeMode;
}

/**
 * Debounced analyzer: POSTs to /api/analyze whenever `text` or `mode` change.
 * Cancels stale requests via AbortController so results arrive in order.
 */
export function useAnalyze(text: string, mode: AnalyzeMode, debounceMs = 400): UseAnalyzeResult {
  const [sentences, setSentences] = useState<AnalyzeResponse["sentences"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!text.trim()) {
      setSentences([]);
      setError(null);
      setLoading(false);
      return;
    }

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, mode }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Analyze failed (${res.status})`);
        }
        const data = (await res.json()) as AnalyzeResponse;
        if (!ctrl.signal.aborted) setSentences(data.sentences);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
        setSentences([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [text, mode, debounceMs]);

  return { sentences, loading, error, mode };
}

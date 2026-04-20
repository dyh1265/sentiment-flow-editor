"use client";

import { useCallback, useState } from "react";
import type { Suggestion, SuggestRequest, SuggestResponse } from "@/lib/schemas";

interface UseSuggestResult {
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
  fetchSuggestions: (req: SuggestRequest) => Promise<void>;
  reset: () => void;
}

export function useSuggest(): UseSuggestResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (req: SuggestRequest) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Suggest failed (${res.status})`);
      }
      const data = (await res.json()) as SuggestResponse;
      setSuggestions(data.suggestions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setLoading(false);
  }, []);

  return { suggestions, loading, error, fetchSuggestions, reset };
}

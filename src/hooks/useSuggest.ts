"use client";

import { useCallback, useState } from "react";
import type { Suggestion, SuggestRequest } from "@/lib/schemas";
import { suggestRewrites } from "@/lib/client/suggest";

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
      const data = await suggestRewrites(req);
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggest failed");
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

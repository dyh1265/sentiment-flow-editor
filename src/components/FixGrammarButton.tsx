"use client";

import { useState } from "react";
import { fixGrammar } from "@/lib/client/fixGrammar";

interface FixGrammarButtonProps {
  text: string;
  onFixed: (correctedText: string) => void;
  /** Optional error handler so the page can surface failures in its own banner. */
  onError?: (message: string) => void;
  className?: string;
  /**
   * If provided, clicking uses this cached result instead of calling the LLM.
   * Used by demo mode so visitors can see grammar-fix behavior without a key.
   */
  demoFixed?: string | null;
}

export function FixGrammarButton({
  text,
  onFixed,
  onError,
  className,
  demoFixed = null,
}: FixGrammarButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const disabled = !text.trim() || state === "loading";

  const onClick = async () => {
    setState("loading");
    if (demoFixed != null) {
      window.setTimeout(() => {
        onFixed(demoFixed);
        setState("done");
        setTimeout(() => setState("idle"), 1500);
      }, 400);
      return;
    }
    try {
      const result = await fixGrammar({ text });
      onFixed(result.text);
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("idle");
      onError?.(err instanceof Error ? err.message : "Grammar fix failed");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-live="polite"
      title="Fix grammar, spelling, and punctuation while preserving meaning and sentiment"
      className={[
        "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50",
        className ?? "",
      ].join(" ")}
    >
      {state === "loading" ? "Fixing…" : state === "done" ? "Fixed!" : "Fix grammar"}
    </button>
  );
}

"use client";

import { useState } from "react";
import type { FixGrammarResponse } from "@/lib/schemas";

interface FixGrammarButtonProps {
  text: string;
  onFixed: (correctedText: string) => void;
  /** Optional error handler so the page can surface failures in its own banner. */
  onError?: (message: string) => void;
  className?: string;
}

export function FixGrammarButton({
  text,
  onFixed,
  onError,
  className,
}: FixGrammarButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const disabled = !text.trim() || state === "loading";

  const onClick = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/fix-grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as FixGrammarResponse;
      onFixed(json.text);
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

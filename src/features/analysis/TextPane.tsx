"use client";

import { useMemo, useRef } from "react";
import type { ScoredSentenceDto } from "@/lib/schemas";

interface TextPaneProps {
  value: string;
  onChange: (value: string) => void;
  sentences: ScoredSentenceDto[];
  hoveredIndex: number | null;
  onHoverSentence: (index: number | null) => void;
  weakIndices?: Set<number>;
  disabled?: boolean;
}

/**
 * Textarea with a synchronized highlight overlay. The textarea handles all
 * input and selection; the overlay mirrors the same text and paints colored
 * spans per sentence (driven by offsets from the scorer). Hovering a span
 * updates the shared hovered index so the chart can tooltip the same point.
 */
export function TextPane({
  value,
  onChange,
  sentences,
  hoveredIndex,
  onHoverSentence,
  weakIndices,
  disabled,
}: TextPaneProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => buildSegments(value, sentences), [value, sentences]);

  const syncScroll = () => {
    if (!overlayRef.current || !textareaRef.current) return;
    overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  return (
    <div className="relative h-full w-full rounded-md border border-gray-300 bg-white shadow-sm">
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[15px] leading-6 text-transparent"
      >
        {segments.map((seg, i) =>
          seg.kind === "sentence" ? (
            <span
              key={i}
              className={sentenceClass(seg.score, hoveredIndex === seg.index, weakIndices?.has(seg.index))}
              onMouseEnter={() => onHoverSentence(seg.index)}
              onMouseLeave={() => onHoverSentence(null)}
              style={{ pointerEvents: "auto" }}
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {/* Trailing newline so overlay height matches textarea scrollHeight. */}
        {"\n"}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        disabled={disabled}
        spellCheck
        placeholder="Paste or type your text here. We'll score each sentence and chart the emotional flow."
        className="relative h-full w-full resize-none rounded-md bg-transparent p-4 font-mono text-[15px] leading-6 text-gray-900 caret-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

type Segment =
  | { kind: "sentence"; text: string; index: number; score: number }
  | { kind: "gap"; text: string };

function buildSegments(text: string, sentences: ScoredSentenceDto[]): Segment[] {
  if (!sentences.length) return text ? [{ kind: "gap", text }] : [];
  const out: Segment[] = [];
  let cursor = 0;
  sentences.forEach((s, i) => {
    const start = s.start ?? cursor;
    const end = s.end ?? start + s.text.length;
    if (start > cursor) out.push({ kind: "gap", text: text.slice(cursor, start) });
    out.push({
      kind: "sentence",
      text: text.slice(start, end),
      index: i,
      score: s.score,
    });
    cursor = end;
  });
  if (cursor < text.length) out.push({ kind: "gap", text: text.slice(cursor) });
  return out;
}

function sentenceClass(score: number, hovered: boolean, weak: boolean | undefined): string {
  const base = "rounded-sm transition-colors";
  const tint =
    score >= 0.2
      ? "bg-green-100"
      : score <= -0.2
        ? "bg-red-100"
        : "bg-amber-50";
  const hover = hovered ? " ring-2 ring-blue-400" : "";
  const weakRing = weak && !hovered ? " ring-1 ring-dashed ring-orange-400" : "";
  return `${base} ${tint}${hover}${weakRing}`;
}


"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ScoredSentenceDto } from "@/lib/schemas";

interface TextPaneProps {
  value: string;
  onChange: (value: string) => void;
  sentences: ScoredSentenceDto[];
  hoveredIndex: number | null;
  onHoverSentence: (index: number | null) => void;
  selectedIndex?: number | null;
  /**
   * Fires when the user clicks inside a sentence. The caller can use this
   * to open the suggestion panel for that sentence.
   */
  onSelectSentence?: (index: number) => void;
  weakIndices?: Set<number>;
  disabled?: boolean;
  /**
   * Fires when the user pastes content that replaces (nearly) the entire
   * textarea \u2013 selection covers \u226580% of content, or the textarea
   * was empty. The caller should treat the next onChange payload as a new
   * baseline (reset "original").
   */
  onWholesalePaste?: () => void;
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
  selectedIndex,
  onSelectSentence,
  weakIndices,
  disabled,
  onWholesalePaste,
}: TextPaneProps) {
  const resolveSentenceAt = (caret: number): number | null => {
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const start = s.start ?? -1;
      const end = s.end ?? -1;
      if (start >= 0 && end >= 0 && caret >= start && caret <= end) return i;
    }
    return null;
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(() => buildSegments(value, sentences), [value, sentences]);

  // Auto-resize the textarea to fit its content so the pane grows with
  // the document rather than scrolling internally. The highlight overlay
  // is absolute inset-0 so it mirrors the new height automatically.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value]);

  const syncScroll = () => {
    if (!overlayRef.current || !textareaRef.current) return;
    overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  return (
    <div className="relative min-h-[inherit] w-full rounded-md border border-gray-300 bg-white shadow-sm">
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[15px] leading-6 text-transparent"
      >
        {segments.map((seg, i) =>
          seg.kind === "sentence" ? (
            <span
              key={i}
              className={sentenceClass(
                seg.score,
                hoveredIndex === seg.index,
                weakIndices?.has(seg.index),
                selectedIndex === seg.index,
              )}
              onMouseEnter={() => onHoverSentence(seg.index)}
              onMouseLeave={() => onHoverSentence(null)}
              onClick={() => onSelectSentence?.(seg.index)}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              title="Click to suggest rewrites"
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
        onClick={(e) => {
          if (!onSelectSentence) return;
          const idx = resolveSentenceAt(e.currentTarget.selectionStart ?? 0);
          if (idx != null) onSelectSentence(idx);
        }}
        onPaste={(e) => {
          if (!onWholesalePaste) return;
          const ta = e.currentTarget;
          const pasted = e.clipboardData.getData("text");
          if (pasted.length < 20) return;
          const len = ta.value.length;
          const replacing = ta.selectionEnd - ta.selectionStart;
          const covers = len === 0 ? 1 : replacing / len;
          if (covers >= 0.8) onWholesalePaste();
        }}
        disabled={disabled}
        spellCheck
        placeholder="Paste or type your text here. We'll score each sentence and chart the emotional flow."
        rows={1}
        className="relative block w-full resize-none overflow-hidden rounded-md bg-transparent p-4 font-mono text-[15px] leading-6 text-gray-900 caret-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
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

function sentenceClass(
  score: number,
  hovered: boolean,
  weak: boolean | undefined,
  selected: boolean,
): string {
  const base = "rounded-sm transition-colors";
  const tint =
    score >= 0.2
      ? "bg-green-100"
      : score <= -0.2
        ? "bg-red-100"
        : "bg-amber-50";
  // Selected wins over hovered wins over weak for ring styling.
  const ring = selected
    ? " ring-2 ring-blue-600"
    : hovered
      ? " ring-2 ring-blue-400"
      : weak
        ? " ring-1 ring-dashed ring-orange-400"
        : "";
  return `${base} ${tint}${ring}`;
}


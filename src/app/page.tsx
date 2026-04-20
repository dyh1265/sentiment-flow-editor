"use client";

import { useMemo, useState } from "react";
import { TextPane } from "@/features/analysis/TextPane";
import { SentimentChart } from "@/features/analysis/SentimentChart";
import { ArcPicker } from "@/features/target-arcs/ArcPicker";
import { SuggestionPanel } from "@/features/rewrite/SuggestionPanel";
import { BeforeAfterToggle } from "@/features/rewrite/BeforeAfterToggle";
import { useAnalyze } from "@/hooks/useAnalyze";
import { buildArc, type ArcId } from "@/lib/arcs";
import { detectWeakIndices } from "@/lib/detectWeak";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import type { AnalyzeMode, ScoredSentenceDto } from "@/lib/schemas";

const SAMPLE_TEXT =
  "We started the project full of hope. Then the first prototype failed spectacularly. " +
  "We kept pushing. Slowly, things began to click. Today, the product is genuinely delightful.";

export default function Page() {
  const [current, setCurrent] = useState("");
  const [original, setOriginal] = useState<string>("");
  const [mode, setMode] = useState<AnalyzeMode>("local");
  const [arcId, setArcId] = useState<ArcId | null>("story");
  const [hovered, setHovered] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [view, setView] = useState<"after" | "before">("after");

  const dirty = current !== original;
  const visibleText = view === "before" ? original : current;

  const { sentences, loading, error } = useAnalyze(visibleText, mode);

  const target = useMemo(
    () => (arcId ? buildArc(arcId, sentences.length) : null),
    [arcId, sentences.length],
  );
  const weakIndices = useMemo(
    () => new Set(detectWeakIndices(sentences, target)),
    [sentences, target],
  );

  const selected =
    selectedIndex != null && sentences[selectedIndex]
      ? { index: selectedIndex, sentence: sentences[selectedIndex] }
      : null;
  const selectedTarget = selected && target ? target[selected.index] : null;
  const selectedBefore = contextBefore(sentences, selected?.index);
  const selectedAfter = contextAfter(sentences, selected?.index);

  const handleChange = (next: string) => {
    if (view === "before") {
      setView("after");
      setCurrent(next);
      return;
    }
    // First user edit after scratch paste becomes the new "original" baseline
    // so "Before/After" compares against the text they actually pasted.
    if (!dirty && next !== current) {
      setOriginal(current);
    }
    setCurrent(next);
  };

  const handleApply = (index: number, newText: string) => {
    const s = sentences[index];
    if (!s || s.start == null || s.end == null) return;
    if (!dirty) setOriginal(current);
    const source = view === "before" ? original : current;
    const updated = source.slice(0, s.start) + newText + source.slice(s.end);
    setCurrent(updated);
    setView("after");
    setSelectedIndex(null);
  };

  const handleReset = () => {
    setCurrent(original);
    setSelectedIndex(null);
    setView("after");
  };

  const handleLoadSample = () => {
    setCurrent(SAMPLE_TEXT);
    setOriginal(SAMPLE_TEXT);
    setView("after");
    setSelectedIndex(null);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div>
          <h1 className="text-xl font-semibold">Sentiment Flow Editor</h1>
          <p className="text-xs text-gray-500">
            Paste text, see the emotional curve per sentence, and rewrite weak beats.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <BeforeAfterToggle
            view={view}
            onChange={setView}
            hasOriginal={original.length > 0}
            dirty={dirty}
            onReset={handleReset}
          />
          <CopyButton text={current} label="Copy text" />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mode === "llm"}
              onChange={(e) => setMode(e.target.checked ? "llm" : "local")}
            />
            <span>High-accuracy (LLM)</span>
          </label>
        </div>
      </header>

      <div className="border-b border-gray-200 bg-gray-50 px-6 py-2">
        <ArcPicker value={arcId} onChange={setArcId} />
      </div>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <div className="min-h-[480px]">
          <TextPane
            value={visibleText}
            onChange={handleChange}
            sentences={sentences}
            hoveredIndex={hovered}
            onHoverSentence={setHovered}
            weakIndices={weakIndices}
            disabled={view === "before"}
          />
        </div>
        <div className="flex min-h-[480px] flex-col gap-3">
          <div className="flex-1">
            {visibleText.trim().length === 0 && !loading ? (
              <EmptyState onLoadSample={handleLoadSample} />
            ) : (
              <SentimentChart
                sentences={sentences}
                target={target}
                hoveredIndex={hovered}
                onHoverSentence={setHovered}
                weakIndices={weakIndices}
                loading={loading}
              />
            )}
          </div>
          <WeakPicker
            sentences={sentences}
            weakIndices={weakIndices}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
          <SuggestionPanel
            selected={selected}
            targetScore={selectedTarget}
            before={selectedBefore}
            after={selectedAfter}
            onApply={handleApply}
            onDismiss={() => setSelectedIndex(null)}
          />
        </div>
      </section>
    </main>
  );
}

function contextBefore(sentences: ScoredSentenceDto[], idx: number | undefined): string {
  if (idx == null) return "";
  return sentences
    .slice(Math.max(0, idx - 2), idx)
    .map((s) => s.text)
    .join(" ");
}

function contextAfter(sentences: ScoredSentenceDto[], idx: number | undefined): string {
  if (idx == null) return "";
  return sentences
    .slice(idx + 1, idx + 3)
    .map((s) => s.text)
    .join(" ");
}

function WeakPicker({
  sentences,
  weakIndices,
  selectedIndex,
  onSelect,
}: {
  sentences: ScoredSentenceDto[];
  weakIndices: Set<number>;
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
}) {
  const weak = Array.from(weakIndices.values()).sort((a, b) => a - b);
  if (weak.length === 0) return null;
  return (
    <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-orange-700">
        Weak sentences ({weak.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {weak.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(selectedIndex === i ? null : i)}
            className={[
              "max-w-[320px] truncate rounded-md border px-2 py-1 text-left text-xs",
              selectedIndex === i
                ? "border-blue-500 bg-white text-blue-700"
                : "border-orange-300 bg-white text-gray-700 hover:border-orange-500",
            ].join(" ")}
            title={sentences[i]?.text}
          >
            #{i + 1}: {sentences[i]?.text.slice(0, 60) ?? ""}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { TextPane } from "@/features/analysis/TextPane";
import { SentimentChart } from "@/features/analysis/SentimentChart";
import { ArcPicker } from "@/features/target-arcs/ArcPicker";
import { SuggestionPanel } from "@/features/rewrite/SuggestionPanel";
import { BeforeAfterToggle } from "@/features/rewrite/BeforeAfterToggle";
import { useAnalyze } from "@/hooks/useAnalyze";
import { buildArc, type ArcId } from "@/lib/arcs";
import { detectWeakIndices } from "@/lib/detectWeak";
import { CopyButton } from "@/components/CopyButton";
import { FixGrammarButton } from "@/components/FixGrammarButton";
import { EmptyState } from "@/components/EmptyState";
import { detectLanguage } from "@/lib/detectLanguage";
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
  // Flag set by TextPane's onPaste when the paste replaces (nearly) the whole
  // textarea. The next onChange payload becomes the new baseline rather than
  // leaving a stale "original" behind.
  const wholesalePasteRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const language = useMemo(() => detectLanguage(visibleText), [visibleText]);
  const showLanguageWarning =
    language.confident && !language.isEnglish && mode === "local";

  const selected =
    selectedIndex != null && sentences[selectedIndex]
      ? { index: selectedIndex, sentence: sentences[selectedIndex] }
      : null;
  const selectedTarget = selected && target ? target[selected.index] : null;
  const selectedBefore = contextBefore(sentences, selected?.index);
  const selectedAfter = contextAfter(sentences, selected?.index);

  const handleChange = (next: string) => {
    // Wholesale paste: the user just replaced (nearly) all the text. Treat
    // the new content as a fresh start so Before/After doesn't show stale text.
    if (wholesalePasteRef.current) {
      wholesalePasteRef.current = false;
      setOriginal(next);
      setCurrent(next);
      setView("after");
      setSelectedIndex(null);
      return;
    }
    if (view === "before") {
      setView("after");
      setCurrent(next);
      return;
    }
    // First user edit after a clean state becomes the new "original" baseline.
    // Don't try to be clever about empty content here: typed-from-scratch
    // leaves original = "" and we snapshot on the first Apply instead
    // (see handleApply) so we don't mis-capture a single keystroke.
    if (!dirty && next !== current) {
      setOriginal(current);
    }
    setCurrent(next);
  };

  const handleApply = (index: number, newText: string) => {
    const s = sentences[index];
    if (!s || s.start == null || s.end == null) return;
    // Capture the pre-rewrite text as the baseline if we don't already have
    // one. This handles "type from scratch, then click Apply" — where dirty
    // went true on the very first keystroke and we never snapshotted.
    if (!dirty || original.trim().length === 0) setOriginal(current);
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

  const handleFixGrammar = (corrected: string) => {
    // Treat grammar-fix like an Apply: capture the pre-fix text as the
    // baseline if we don't already have one, so "Before" shows the typo'd
    // original and "After" shows the corrected version.
    if (!dirty || original.trim().length === 0) setOriginal(current);
    setCurrent(corrected);
    setView("after");
    setSelectedIndex(null);
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
          <FixGrammarButton
            text={current}
            onFixed={(corrected) => {
              setActionError(null);
              handleFixGrammar(corrected);
            }}
            onError={(msg) => setActionError(msg)}
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

      {showLanguageWarning ? (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          <span>
            Detected <span className="font-medium">{language.name}</span>. Local scoring
            (VADER) is English-only and will be unreliable for this text.
          </span>
          <button
            type="button"
            onClick={() => setMode("llm")}
            className="ml-4 whitespace-nowrap rounded-md border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Switch to High-accuracy (LLM)
          </button>
        </div>
      ) : null}

      {error || actionError ? (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          <span>{actionError ?? error}</span>
          {actionError ? (
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-4 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <div className="min-h-[480px]">
          <TextPane
            value={visibleText}
            onChange={handleChange}
            onWholesalePaste={() => {
              wholesalePasteRef.current = true;
            }}
            sentences={sentences}
            hoveredIndex={hovered}
            onHoverSentence={setHovered}
            selectedIndex={selectedIndex}
            onSelectSentence={(i) => setSelectedIndex(i)}
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
          {sentences.length > 0 && selectedIndex == null ? (
            <p className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500">
              Tip: click any sentence in the text to generate rewrites for it.
            </p>
          ) : null}
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

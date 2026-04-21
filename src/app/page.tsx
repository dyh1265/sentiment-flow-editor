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
import { SettingsModal } from "@/components/SettingsModal";
import { detectLanguage } from "@/lib/detectLanguage";
import { loadSettings } from "@/lib/client/apiKey";
import {
  DEMO,
  buildDemoSentences,
  demoSuggestionsFor,
  scriptedRewriteIndices,
} from "@/lib/demo";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped every time settings are saved so LLM hooks re-run with the new key.
  const [settingsVersion, setSettingsVersion] = useState(0);
  // Demo mode swaps in pre-computed LLM output so visitors can see the full
  // flow without a key. Any text edit flips this off.
  const [demoMode, setDemoMode] = useState(false);
  // When a canned rewrite is Applied in demo mode, we stash its
  // predictedScore here keyed by sentence index. The demo sentence builder
  // uses this to recompute the chart deterministically — the curve should
  // *actually* improve for the rewritten sentence, not stay frozen.
  const [demoOverrides, setDemoOverrides] = useState<Record<number, number>>({});
  const hasApiKey = useMemo(
    () => Boolean(loadSettings().apiKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settingsVersion],
  );

  const dirty = current !== original;
  const visibleText = view === "before" ? original : current;

  // In demo mode we short-circuit analysis to the cached payload. Feeding an
  // empty string to useAnalyze keeps it idle so there's no flicker or wasted
  // work while the cached sentences are on screen.
  const analyze = useAnalyze(demoMode ? "" : visibleText, mode, settingsVersion);
  // Rebuild demo sentences from whatever text is currently visible so Applied
  // rewrites and Before/After toggles stay truthful. Overrides only apply to
  // the "after" view — "before" shows the pristine demo baseline.
  const demoSentences = useMemo(() => {
    if (!demoMode || !visibleText) return [] as ScoredSentenceDto[];
    return buildDemoSentences(visibleText, view === "after" ? demoOverrides : {});
  }, [demoMode, visibleText, view, demoOverrides]);
  const sentences = demoMode ? demoSentences : analyze.sentences;
  const loading = demoMode ? false : analyze.loading;
  const error = demoMode ? null : analyze.error;

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
    // Editing the demo text drops us out of demo mode. The cached scores no
    // longer match the new text, so we let the normal analyze flow take over.
    if (demoMode) {
      setDemoMode(false);
      setDemoOverrides({});
      setOriginal("");
      setCurrent(next);
      setView("after");
      setSelectedIndex(null);
      return;
    }
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

  const handleApply = (index: number, newText: string, predictedScore: number) => {
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
    // In demo mode, record the suggestion's predicted score so the chart
    // deterministically redraws with the rewritten sentence's new value.
    // (Outside demo mode, re-analysis of the new text will compute real scores.)
    if (demoMode) {
      setDemoOverrides((prev) => ({ ...prev, [index]: predictedScore }));
    }
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
    // Grammar fix replaces the whole text, so any per-sentence overrides
    // from earlier Applied rewrites no longer correspond to what's on screen.
    // Reset them so the chart reflects the fresh pristine-scored demo text.
    if (demoMode) setDemoOverrides({});
  };

  const handleLoadSample = () => {
    setCurrent(SAMPLE_TEXT);
    setOriginal(SAMPLE_TEXT);
    setView("after");
    setSelectedIndex(null);
  };

  const handlePlayDemo = () => {
    setDemoMode(true);
    setDemoOverrides({});
    setCurrent(DEMO.sampleText);
    setOriginal("");
    setArcId(DEMO.arcId);
    setView("after");
    setSelectedIndex(DEMO.scriptedIndex);
    setHovered(null);
    setActionError(null);
    // Intentionally do not flip mode to "llm" — demo mode short-circuits
    // analysis entirely, and leaving mode alone means the user's preference
    // is preserved for when they exit the demo.
  };

  const handleClear = () => {
    // Only confirm when there's real content on the line — an empty editor
    // has nothing to lose, and a lone whitespace character shouldn't trigger
    // a dialog either.
    if (
      current.trim().length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm("Clear the editor? This will wipe both the text and the Before baseline.")
    ) {
      return;
    }
    setCurrent("");
    setOriginal("");
    setView("after");
    setSelectedIndex(null);
    setHovered(null);
    setActionError(null);
    setDemoMode(false);
    setDemoOverrides({});
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
          {hasApiKey || demoMode ? (
            <FixGrammarButton
              text={current}
              onFixed={(corrected) => {
                setActionError(null);
                handleFixGrammar(corrected);
              }}
              onError={(msg) => setActionError(msg)}
              demoFixed={demoMode ? DEMO.grammarFix : null}
            />
          ) : null}
          <CopyButton text={current} label="Copy text" />
          <button
            type="button"
            onClick={handleClear}
            disabled={current.length === 0 && original.length === 0}
            title="Clear the editor and reset Before/After"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handlePlayDemo}
            title="Load a sample story and explore the full flow with pre-computed LLM results"
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100"
          >
            Play demo
          </button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mode === "llm"}
              onChange={(e) => setMode(e.target.checked ? "llm" : "local")}
            />
            <span>High-accuracy (LLM)</span>
          </label>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="API key and model settings"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Settings
            {!hasApiKey ? (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
            ) : null}
          </button>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setSettingsVersion((v) => v + 1)}
      />

      <div className="border-b border-gray-200 bg-gray-50 px-6 py-2">
        <ArcPicker value={arcId} onChange={setArcId} />
      </div>

      {demoMode ? (
        <div className="flex items-center justify-between border-b border-blue-200 bg-blue-50 px-6 py-2 text-sm text-blue-800">
          <span>
            <span className="mr-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Demo
            </span>
            Showing cached LLM output on sample text. Start typing to try your own text
            {hasApiKey ? "." : " — you'll need an API key for rewrites on custom text."}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-4 whitespace-nowrap rounded-md border border-blue-400 bg-white px-2 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100"
          >
            Exit demo
          </button>
        </div>
      ) : null}

      {mode === "llm" && !hasApiKey && !demoMode ? (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
          <span>
            High-accuracy mode needs an OpenAI API key. Add one in Settings, or switch
            back to local scoring.
          </span>
          <div className="ml-4 flex gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="whitespace-nowrap rounded-md border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Open Settings
            </button>
            <button
              type="button"
              onClick={() => setMode("local")}
              className="whitespace-nowrap rounded-md border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Use local
            </button>
          </div>
        </div>
      ) : null}

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
              <EmptyState onLoadSample={handleLoadSample} onPlayDemo={handlePlayDemo} />
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
            demoSuggestions={
              demoMode && arcId ? demoSuggestionsFor(selectedIndex, arcId) : null
            }
            scriptedIndices={demoMode && arcId ? scriptedRewriteIndices(arcId) : null}
            // Locked whenever the user has no real key — demo or not. In demo
            // the panel still falls back to canned data when it exists for
            // this sentence (hasCanned overrides the lock). Without canned
            // data, we show a friendly nudge toward Settings instead of
            // letting the button fire and throw MissingApiKeyError.
            llmLocked={!hasApiKey}
            onOpenSettings={() => setSettingsOpen(true)}
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

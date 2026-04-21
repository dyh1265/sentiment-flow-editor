import type { ScoredSentenceDto, Suggestion } from "@/lib/schemas";
import type { ArcId } from "@/lib/arcs";
import { type SentimentLabel, labelForScore } from "@/lib/sentiment/types";
import { splitSentences } from "@/lib/splitSentences";

/**
 * Canned demo payload. Everything in here is *pretending* to be LLM output so
 * the app can show off the LLM features (scoring, rewrites, grammar fix) with
 * zero network traffic and zero API key required.
 *
 * Rules of thumb:
 *   - Sample text splits into exactly N sentences via splitSentences().
 *   - `scoresByIndex[i]` is the fake "LLM" score for the i-th sentence. It
 *     does NOT depend on the target arc — it's what the LLM thinks of the
 *     text as written. The target arc only changes *which* sentences get
 *     flagged as weak.
 *   - `rewritesByArc[arc][i]` holds canned rewrite options for sentence i
 *     under that specific target arc. Each arc covers exactly the sentences
 *     that are weak under its own target curve; the predictedScore values
 *     are tuned so applying any canned rewrite lands the sentence within
 *     the 0.5 weak-threshold of the arc's target.
 *   - `grammarFix` is the canonical "fix grammar" output for the full text.
 *   - `scriptedIndex` is pre-selected on demo start (under `arcId`) to
 *     point users at a sentence we have canned rewrites for.
 */
export interface DemoData {
  sampleText: string;
  arcId: ArcId;
  scoresByIndex: Array<{ score: number; label: SentimentLabel }>;
  rewritesByArc: Record<ArcId, Record<number, Suggestion[]>>;
  grammarFix: string;
  scriptedIndex: number;
}

// The grammar slip is intra-sentence ("werent" instead of "weren't") rather
// than a capitalization error on a sentence start — splitSentences treats
// lowercase-after-period as a non-boundary, so a cross-sentence slip would
// merge two sentences and throw off every index in scoresByIndex/rewrites.
const SAMPLE_TEXT =
  "We launched the product on a rainy Tuesday. " +
  "Signups kept climbing and every notification felt like a small victory. " +
  "Then the server went down in the afternoon. " +
  "Users posted angry tweets for hours. " +
  "Our Slack went silent, then loud, then silent again. " +
  "We cracked jokes between restarts and pretended we werent worried. " +
  "By midnight, we shipped a fix and things stabilized. " +
  "The next morning, feedback was surprisingly warm. " +
  "A customer wrote a thread about how the fix proved we cared. " +
  "We took the team out and finally exhaled.";

// Hand-tuned to create two clearly weak sentences against the story arc:
//   i=1 too rosy during the setup (target ~-0.09, score +0.65 → delta 0.74)
//   i=5 too light during the trough (target ~-0.55, score +0.35 → delta 0.90)
// The rest track the arc within the default 0.5 "weak" threshold.
const SCORES: DemoData["scoresByIndex"] = [
  { score: 0.05, label: "neutral" },
  { score: 0.65, label: "positive" },
  { score: -0.25, label: "negative" },
  { score: -0.35, label: "negative" },
  { score: -0.3, label: "negative" },
  { score: 0.35, label: "positive" },
  { score: -0.3, label: "negative" },
  { score: 0.15, label: "neutral" },
  { score: 0.4, label: "positive" },
  { score: 0.75, label: "positive" },
];

// Canned rewrites per arc. Every weak sentence under the given arc gets
// exactly three options, and every option's predictedScore is within the
// 0.5 weak-threshold of that arc's per-sentence target (locked by a unit
// test that loops over all arcs).
const REWRITES_BY_ARC: Record<ArcId, Record<number, Suggestion[]>> = {
  // Story arc: opens neutral → dips into conflict around the middle →
  // climbs to resolution. Weak = 1 (too rosy during setup) and 5 (too
  // light during trough). Rewrites temper the rise and deepen the dip.
  story: {
    1: [
      {
        text: "Signups kept climbing, and we tried not to get cocky.",
        predictedScore: 0.1,
      },
      {
        text: "Signups climbed fast, but we knew the real test hadn't started.",
        predictedScore: 0.0,
      },
      {
        text: "We watched signups tick up and braced for something to break.",
        predictedScore: -0.1,
      },
    ],
    5: [
      {
        text: "We stopped cracking jokes when the third restart didn't hold.",
        predictedScore: -0.55,
      },
      {
        text: "The jokes ran out somewhere between the second and third outage.",
        predictedScore: -0.45,
      },
      {
        text: "We sat in silence between restarts, too tired to pretend anymore.",
        predictedScore: -0.65,
      },
    ],
  },
  // Persuasive arc: confident, steady ramp from neutral to a strong close.
  // The story's conflict middle fights this shape, so most of the
  // negatively-scored sentences (3, 4, 6) land weak alongside 1. Rewrites
  // reframe each moment as a step in a deliberate argument.
  persuasive: {
    1: [
      {
        text: "Signups climbed fast, and we saw the first real signal that this could work.",
        predictedScore: 0.3,
      },
      {
        text: "Signups kept ticking up, validating everything we had bet on.",
        predictedScore: 0.4,
      },
      {
        text: "Signups came in steady, and conviction grew with every one.",
        predictedScore: 0.2,
      },
    ],
    3: [
      {
        text: "Users filled the feed with feedback, and every thread made the product sharper.",
        predictedScore: 0.3,
      },
      {
        text: "Users stayed engaged for hours, giving us exactly the signal we needed to iterate.",
        predictedScore: 0.4,
      },
      {
        text: "Users kept posting — each comment a free lesson in what mattered most.",
        predictedScore: 0.25,
      },
    ],
    4: [
      {
        text: "Our Slack stayed active, threading through every fix with momentum.",
        predictedScore: 0.3,
      },
      {
        text: "Our Slack hummed with energy, each restart bringing us closer to stable.",
        predictedScore: 0.4,
      },
      {
        text: "Our Slack kept moving — one confident decision after another.",
        predictedScore: 0.5,
      },
    ],
    6: [
      {
        text: "By midnight, we shipped the fix, and the graphs turned decisively green.",
        predictedScore: 0.6,
      },
      {
        text: "By midnight, the fix was live and every metric pointed forward.",
        predictedScore: 0.7,
      },
      {
        text: "By midnight, we shipped a fix that proved the architecture could scale.",
        predictedScore: 0.55,
      },
    ],
  },
  // Viral-hook arc: bold opener → fast dip for tension → steep payoff.
  // Weak = 0 (the opener is flat for a hook) and 6 (midnight-shipped is
  // too muted for the payoff climb). Rewrites punch up both moments.
  viralHook: {
    0: [
      {
        text: "We launched on a rainy Tuesday — and nothing that followed felt ordinary.",
        predictedScore: 0.65,
      },
      {
        text: "On a rainy Tuesday we lit the fuse, and what happened next nobody saw coming.",
        predictedScore: 0.75,
      },
      {
        text: "A rainy Tuesday launch. Within an hour, our whole plan had changed.",
        predictedScore: 0.6,
      },
    ],
    6: [
      {
        text: "By midnight, we shipped the fix — and the feed flipped from fury to relief.",
        predictedScore: 0.35,
      },
      {
        text: "By midnight the fix landed, and the first thank-you tweets started rolling in.",
        predictedScore: 0.45,
      },
      {
        text: "By midnight we shipped — and the silence that followed felt like winning.",
        predictedScore: 0.3,
      },
    ],
  },
};

// Restores the missing apostrophe in "werent" → "weren't".
const GRAMMAR_FIX =
  "We launched the product on a rainy Tuesday. " +
  "Signups kept climbing and every notification felt like a small victory. " +
  "Then the server went down in the afternoon. " +
  "Users posted angry tweets for hours. " +
  "Our Slack went silent, then loud, then silent again. " +
  "We cracked jokes between restarts and pretended we weren't worried. " +
  "By midnight, we shipped a fix and things stabilized. " +
  "The next morning, feedback was surprisingly warm. " +
  "A customer wrote a thread about how the fix proved we cared. " +
  "We took the team out and finally exhaled.";

export const DEMO: DemoData = {
  sampleText: SAMPLE_TEXT,
  arcId: "story",
  scoresByIndex: SCORES,
  rewritesByArc: REWRITES_BY_ARC,
  grammarFix: GRAMMAR_FIX,
  scriptedIndex: 1,
};

/**
 * Zip the demo's cached scores onto spans computed by the real sentence
 * splitter. `text` defaults to the canonical sample, so `buildDemoSentences()`
 * keeps working for tests and for the initial demo render.
 *
 * When the user applies a canned rewrite, the caller can pass an `overrides`
 * map of `{ index: predictedScore }` so the chart reflects the suggestion's
 * predicted impact deterministically — no LLM call, no guesswork.
 */
export function buildDemoSentences(
  text: string = DEMO.sampleText,
  overrides: Record<number, number> = {},
): ScoredSentenceDto[] {
  const spans = splitSentences(text);
  return spans.map((s, i) => {
    const base = DEMO.scoresByIndex[i] ?? {
      score: 0,
      label: "neutral" as SentimentLabel,
    };
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, i);
    const score = hasOverride ? overrides[i] : base.score;
    // When we override the score we must also recompute the label so the
    // highlight color (red/gray/green) tracks the new value.
    const label = hasOverride ? labelForScore(score) : base.label;
    return { text: s.text, score, label, start: s.start, end: s.end };
  });
}

/**
 * Canned suggestions for a given sentence index under the active target
 * arc, or null if none scripted. Picking the right bucket by arc is what
 * makes the demo work across story / persuasive / viralHook.
 */
export function demoSuggestionsFor(
  index: number | null | undefined,
  arcId: ArcId,
): Suggestion[] | null {
  if (index == null) return null;
  return DEMO.rewritesByArc[arcId][index] ?? null;
}

/**
 * Sorted list of 0-based sentence indices that have canned rewrites under
 * the given arc. Used by the UI to nudge the user toward weak sentences
 * when they click a non-scripted one in demo mode without a real API key.
 */
export function scriptedRewriteIndices(arcId: ArcId): number[] {
  return Object.keys(DEMO.rewritesByArc[arcId])
    .map((k) => Number(k))
    .sort((a, b) => a - b);
}

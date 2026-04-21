import { describe, it, expect } from "vitest";
import {
  DEMO,
  buildDemoSentences,
  demoSuggestionsFor,
  scriptedRewriteIndices,
} from "@/lib/demo";
import { ARCS, buildArc, type ArcId } from "@/lib/arcs";
import { detectWeakIndices } from "@/lib/detectWeak";

const ARC_IDS = Object.keys(ARCS) as ArcId[];

describe("demo fixture", () => {
  it("splits into the expected number of cached sentences", () => {
    const sentences = buildDemoSentences();
    expect(sentences).toHaveLength(DEMO.scoresByIndex.length);
    // Every sentence has offsets so click-to-select works out of the box.
    sentences.forEach((s) => {
      expect(typeof s.start).toBe("number");
      expect(typeof s.end).toBe("number");
      expect(s.text.length).toBeGreaterThan(0);
    });
  });

  it("produces weak sentences including the scripted-rewrite index on demo start", () => {
    const sentences = buildDemoSentences();
    const target = buildArc(DEMO.arcId, sentences.length);
    const weak = detectWeakIndices(sentences, target);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak).toContain(DEMO.scriptedIndex);
  });

  it("has canned rewrites for the scripted index under the starting arc", () => {
    const canned = demoSuggestionsFor(DEMO.scriptedIndex, DEMO.arcId);
    expect(canned).not.toBeNull();
    expect(canned!.length).toBeGreaterThan(0);
    canned!.forEach((s) => {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.predictedScore).toBeGreaterThanOrEqual(-1);
      expect(s.predictedScore).toBeLessThanOrEqual(1);
    });
  });

  it("grammar fix differs from the sample text (there is something to fix)", () => {
    expect(DEMO.grammarFix).not.toEqual(DEMO.sampleText);
    // The fix is a correction, not a rewrite. A 20% length delta is a
    // generous ceiling; real edits should be far smaller.
    const delta = Math.abs(DEMO.grammarFix.length - DEMO.sampleText.length);
    expect(delta).toBeLessThan(DEMO.sampleText.length * 0.2);
  });

  it("returns null for indices with no canned rewrites", () => {
    expect(demoSuggestionsFor(999, DEMO.arcId)).toBeNull();
    expect(demoSuggestionsFor(null, DEMO.arcId)).toBeNull();
    expect(demoSuggestionsFor(undefined, DEMO.arcId)).toBeNull();
  });

  it("applies per-index score overrides and re-labels accordingly", () => {
    const base = buildDemoSentences();
    const overridden = buildDemoSentences(DEMO.sampleText, { 1: -0.1 });
    expect(base[1].score).not.toEqual(overridden[1].score);
    expect(overridden[1].score).toBe(-0.1);
    // labelForScore(-0.1) is "neutral", swapped from the base "positive".
    expect(overridden[1].label).toBe("neutral");
    // Other sentences are untouched.
    expect(overridden[0]).toEqual(base[0]);
    expect(overridden[9]).toEqual(base[9]);
  });

  // ==============================================================
  // Per-arc invariants: the demo must work for EVERY target arc.
  // Running the same two checks (coverage + deterministic Apply)
  // across story / persuasive / viralHook keeps the multi-arc demo
  // honest as scores, arcs, or rewrites change over time.
  // ==============================================================

  describe.each(ARC_IDS)("arc=%s", (arcId) => {
    it("exposes scripted indices in ascending order and every one has rewrites", () => {
      const indices = scriptedRewriteIndices(arcId);
      const sorted = [...indices].sort((a, b) => a - b);
      expect(indices).toEqual(sorted);
      indices.forEach((i) => {
        expect(demoSuggestionsFor(i, arcId)).not.toBeNull();
      });
    });

    it("scripted indices match exactly the weak sentences under this arc", () => {
      // The contract: clicking a weak (orange) sentence in demo mode
      // under any arc reveals canned rewrites, and no canned rewrites
      // live on sentences that aren't weak. If scores, arcs, or
      // rewrites drift apart, this fails and tells us which arc broke.
      const base = buildDemoSentences();
      const weak = detectWeakIndices(base, buildArc(arcId, base.length));
      const scripted = scriptedRewriteIndices(arcId);
      expect(scripted.slice().sort((a, b) => a - b)).toEqual(
        weak.slice().sort((a, b) => a - b),
      );
    });

    it("every canned rewrite would leave the weak sentence non-weak after Apply", () => {
      // Deterministic demo: clicking Apply on any canned option must
      // move the sentence strictly inside the 0.5 weak-threshold for
      // THIS arc's target, so the orange highlight actually disappears.
      const base = buildDemoSentences();
      const target = buildArc(arcId, base.length);
      const weak = detectWeakIndices(base, target);
      for (const index of weak) {
        const options = demoSuggestionsFor(index, arcId);
        expect(
          options,
          `weak sentence #${index} has no canned rewrites under ${arcId}`,
        ).not.toBeNull();
        for (const option of options!) {
          const delta = Math.abs(option.predictedScore - target[index]);
          expect(
            delta,
            `rewrite "${option.text}" for #${index} under ${arcId} stays weak (delta ${delta.toFixed(2)})`,
          ).toBeLessThan(0.5);
        }
      }
    });
  });
});

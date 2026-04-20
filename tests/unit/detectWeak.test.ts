import { describe, expect, it } from "vitest";
import { DEFAULT_WEAK_THRESHOLD, detectWeakIndices } from "@/lib/detectWeak";
import type { ScoredSentenceDto } from "@/lib/schemas";

const mk = (score: number, i: number): ScoredSentenceDto => ({
  text: `s${i}`,
  score,
  label: score <= -0.2 ? "negative" : score >= 0.2 ? "positive" : "neutral",
});

describe("detectWeakIndices", () => {
  it("returns [] with no target", () => {
    const s = [mk(0.1, 0), mk(0.2, 1)];
    expect(detectWeakIndices(s, null)).toEqual([]);
    expect(detectWeakIndices(s, undefined)).toEqual([]);
  });

  it("returns [] when target length mismatches sentence count", () => {
    const s = [mk(0.1, 0), mk(0.2, 1)];
    expect(detectWeakIndices(s, [0.1, 0.2, 0.3])).toEqual([]);
  });

  it("flags sentences where |actual - target| >= threshold", () => {
    const s = [mk(0.0, 0), mk(0.1, 1), mk(-0.8, 2), mk(0.9, 3)];
    const target = [0.0, 0.7, 0.0, 0.8];
    // idx 0: diff 0 -> not weak
    // idx 1: diff 0.6 -> weak
    // idx 2: diff 0.8 -> weak
    // idx 3: diff 0.1 -> not weak
    expect(detectWeakIndices(s, target, DEFAULT_WEAK_THRESHOLD)).toEqual([1, 2]);
  });

  it("respects a custom threshold", () => {
    const s = [mk(0, 0), mk(0.1, 1)];
    const target = [0.3, 0.3];
    expect(detectWeakIndices(s, target, 0.1)).toEqual([0, 1]);
    expect(detectWeakIndices(s, target, 0.25)).toEqual([0]);
    expect(detectWeakIndices(s, target, 1)).toEqual([]);
  });
});

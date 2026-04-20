import { describe, expect, it } from "vitest";
import { scoreTextLocal } from "@/lib/sentiment/local";
import { labelForScore, clampScore } from "@/lib/sentiment/types";

describe("labelForScore", () => {
  it("labels by threshold", () => {
    expect(labelForScore(-1)).toBe("negative");
    expect(labelForScore(-0.2)).toBe("negative");
    expect(labelForScore(-0.1)).toBe("neutral");
    expect(labelForScore(0)).toBe("neutral");
    expect(labelForScore(0.19)).toBe("neutral");
    expect(labelForScore(0.2)).toBe("positive");
    expect(labelForScore(1)).toBe("positive");
  });
});

describe("clampScore", () => {
  it("clamps to [-1, 1] and handles NaN", () => {
    expect(clampScore(2)).toBe(1);
    expect(clampScore(-2)).toBe(-1);
    expect(clampScore(0.3)).toBe(0.3);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe("scoreTextLocal", () => {
  it("returns one entry per sentence with scores in [-1,1]", () => {
    const res = scoreTextLocal("I love this! This is terrible. It is a chair.");
    expect(res).toHaveLength(3);
    for (const s of res) {
      expect(s.score).toBeGreaterThanOrEqual(-1);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(["negative", "neutral", "positive"]).toContain(s.label);
    }
  });

  it("scores a clearly positive sentence positive", () => {
    const [s] = scoreTextLocal("I absolutely love this fantastic wonderful day!");
    expect(s.score).toBeGreaterThan(0.2);
    expect(s.label).toBe("positive");
  });

  it("scores a clearly negative sentence negative", () => {
    const [s] = scoreTextLocal("This is absolutely horrible and I hate it.");
    expect(s.score).toBeLessThan(-0.2);
    expect(s.label).toBe("negative");
  });

  it("returns empty array for empty input", () => {
    expect(scoreTextLocal("")).toEqual([]);
  });

  it("preserves start/end offsets for each sentence", () => {
    const src = "Great day. Bad day.";
    const res = scoreTextLocal(src);
    expect(res).toHaveLength(2);
    expect(src.slice(res[0].start!, res[0].end!)).toBe("Great day.");
    expect(src.slice(res[1].start!, res[1].end!)).toBe("Bad day.");
  });
});

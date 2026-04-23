import { beforeEach, describe, expect, it, vi } from "vitest";

const suggestRewritesMock = vi.fn();
vi.mock("@/lib/client/suggest", () => ({
  suggestRewrites: suggestRewritesMock,
}));

// Mock VADER so each test can deterministically set the "real" score of a
// candidate via its text. Convention: text of the form "score:0.65..." parses
// out to a VADER score of 0.65 for the first sub-sentence. Tests that don't
// care about VADER just write whatever and it'll come back as 0.
const scoreTextLocalMock = vi.fn();
vi.mock("@/lib/sentiment/local", () => ({
  scoreTextLocal: scoreTextLocalMock,
}));

function parseScore(text: string): number {
  const m = text.match(/score:(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

beforeEach(() => {
  scoreTextLocalMock.mockImplementation((text: string) => [
    { text, score: parseScore(text), label: "neutral", start: 0, end: text.length },
  ]);
});

async function loadAutoFix() {
  return await import("@/lib/client/autoFix");
}

function makeSentence(index: number, text = `sentence ${index}`) {
  return {
    index,
    text,
    score: 0,
    label: "neutral" as const,
    start: index * 40,
    end: index * 40 + text.length,
  };
}

describe("autoFixForArc", () => {
  beforeEach(() => {
    suggestRewritesMock.mockReset();
  });

  it("returns empty result for empty weakIndices without calling the LLM", async () => {
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [],
      targets: [0.5],
    });
    expect(result.rewrites).toEqual([]);
    expect(result.failedIndices).toEqual([]);
    expect(suggestRewritesMock).not.toHaveBeenCalled();
  });

  it("rewrites each weak sentence and picks the candidate whose REAL score is closest to target", async () => {
    // LLM self-reports are intentionally misleading here: the "off" option
    // claims a high predicted score, but VADER knows the "hit" option is
    // closer. This tests that we rank by REAL score, not LLM self-report.
    suggestRewritesMock.mockImplementation(async ({ targetScore }: { targetScore: number }) => ({
      suggestions: [
        { text: `off lie score:0`, predictedScore: targetScore }, // LLM lies
        { text: `hit score:${targetScore - 0.05}`, predictedScore: 0 }, // LLM underestimates
      ],
    }));

    const sentences = [makeSentence(0), makeSentence(1), makeSentence(2)];
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences,
      weakIndices: [0, 2],
      targets: [0.6, 0, -0.4],
    });

    expect(result.failedIndices).toEqual([]);
    expect(result.rewrites).toHaveLength(2);
    expect(result.rewrites[0].newText).toMatch(/^hit score:/);
    expect(result.rewrites[0].predictedScore).toBeCloseTo(0.55, 5);
    expect(result.rewrites[1].newText).toMatch(/^hit score:/);
    expect(result.rewrites[1].predictedScore).toBeCloseTo(-0.45, 5);
    expect(suggestRewritesMock).toHaveBeenCalledTimes(2);
  });

  it("sorts returned rewrites by sentence index regardless of completion order", async () => {
    suggestRewritesMock.mockImplementation(async ({ sentence }: { sentence: string }) => {
      const delay = sentence.includes("0") ? 20 : 1;
      await new Promise((r) => setTimeout(r, delay));
      return { suggestions: [{ text: `rw ${sentence} score:0.5`, predictedScore: 0.5 }] };
    });
    const sentences = [makeSentence(0), makeSentence(1), makeSentence(2)];
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences,
      weakIndices: [2, 0],
      targets: [0.5, 0, 0.5],
    });
    expect(result.rewrites.map((r) => r.index)).toEqual([0, 2]);
  });

  it("collects per-sentence failures without killing the whole batch", async () => {
    suggestRewritesMock.mockImplementation(
      async ({ sentence }: { sentence: string }) => {
        if (sentence.includes("1")) {
          throw new Error("429 rate limited");
        }
        return { suggestions: [{ text: `ok score:0.5`, predictedScore: 0.5 }] };
      },
    );
    const sentences = [makeSentence(0), makeSentence(1), makeSentence(2)];
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences,
      weakIndices: [0, 1, 2],
      targets: [0.5, 0.5, 0.5],
    });
    expect(result.rewrites.map((r) => r.index)).toEqual([0, 2]);
    expect(result.failedIndices).toEqual([1]);
    expect(result.firstError).toContain("429");
  });

  it("marks sentences with empty suggestion arrays as failed", async () => {
    suggestRewritesMock.mockResolvedValue({ suggestions: [] });
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.5],
    });
    expect(result.rewrites).toEqual([]);
    expect(result.failedIndices).toEqual([0]);
  });

  it("iterates until VADER says the rewrite is within tolerance", async () => {
    // LLM claims every rewrite hits target, but real VADER score climbs slowly.
    const realScores = [0.1, 0.25, 0.45, 0.55];
    let call = 0;
    suggestRewritesMock.mockImplementation(async () => {
      const real = realScores[Math.min(call, realScores.length - 1)];
      call += 1;
      return {
        suggestions: [{ text: `try${call} score:${real}`, predictedScore: 0.7 }],
      };
    });

    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.7],
      maxIterations: 5,
      tolerance: 0.2,
    });

    // Stops at iteration 4 (real=0.55, |0.7-0.55|=0.15 <= 0.2).
    expect(suggestRewritesMock).toHaveBeenCalledTimes(4);
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0].newText).toContain("try4 score:0.55");
    expect(result.rewrites[0].predictedScore).toBeCloseTo(0.55, 5);
  });

  it("stops iterating early when the first attempt's REAL score is already within tolerance", async () => {
    suggestRewritesMock.mockResolvedValue({
      suggestions: [{ text: `hit score:0.55`, predictedScore: 0.7 }],
    });
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.7],
      maxIterations: 5,
      tolerance: 0.2,
    });
    expect(suggestRewritesMock).toHaveBeenCalledTimes(1);
    expect(result.rewrites[0].newText).toContain("hit score:0.55");
  });

  it("in llm scorerMode, ranks by predictedScore instead of local VADER score", async () => {
    // Both texts have VADER=0 under this test harness (no score:<n> marker),
    // so only predictedScore can separate them.
    suggestRewritesMock.mockResolvedValue({
      suggestions: [
        { text: "candidate A", predictedScore: 0.2 },
        { text: "candidate B", predictedScore: 0.68 },
      ],
    });
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.7],
      scorerMode: "llm",
      maxIterations: 1,
    });
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0].newText).toBe("candidate B");
    expect(result.rewrites[0].predictedScore).toBeCloseTo(0.68, 5);
  });

  it("keeps iterating to maxIterations even when text repeats", async () => {
    // Repeated text used to short-circuit too early; now we keep trying
    // through the configured iteration budget so one click works harder.
    suggestRewritesMock.mockResolvedValue({
      suggestions: [{ text: `stuck score:0.1`, predictedScore: 0.7 }],
    });
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.7],
      maxIterations: 4,
      tolerance: 0.2,
    });
    expect(suggestRewritesMock).toHaveBeenCalledTimes(4);
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0].newText).toContain("stuck score:0.1");
  });

  it("returns the closest-to-target candidate when no iteration converges", async () => {
    const reals = [0.0, 0.1, 0.2];
    let call = 0;
    suggestRewritesMock.mockImplementation(async () => ({
      suggestions: [
        {
          text: `attempt${call + 1} score:${reals[Math.min(call++, reals.length - 1)]}`,
          predictedScore: 0.7,
        },
      ],
    }));
    const { autoFixForArc } = await loadAutoFix();
    const result = await autoFixForArc({
      sentences: [makeSentence(0)],
      weakIndices: [0],
      targets: [0.7],
      maxIterations: 3,
      tolerance: 0.2,
    });
    expect(suggestRewritesMock).toHaveBeenCalledTimes(3);
    expect(result.rewrites).toHaveLength(1);
    // Closest of real {0, 0.1, 0.2} to 0.7 is 0.2
    expect(result.rewrites[0].newText).toContain("attempt3 score:0.2");
    expect(result.rewrites[0].predictedScore).toBeCloseTo(0.2, 5);
  });

  it("respects the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    suggestRewritesMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      // Return a candidate that converges on first try so we don't inflate
      // call counts and mask concurrency.
      return { suggestions: [{ text: `done score:0.5`, predictedScore: 0.5 }] };
    });
    const sentences = Array.from({ length: 6 }, (_, i) => makeSentence(i));
    const { autoFixForArc } = await loadAutoFix();
    await autoFixForArc({
      sentences,
      weakIndices: [0, 1, 2, 3, 4, 5],
      targets: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      concurrency: 2,
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("pickClosest", () => {
  it("returns null for empty list", async () => {
    const { pickClosest } = await loadAutoFix();
    expect(pickClosest([], 0)).toBeNull();
  });

  it("picks the candidate with the smallest |predictedScore - target|", async () => {
    const { pickClosest } = await loadAutoFix();
    const picked = pickClosest(
      [
        { text: "a", predictedScore: 0.0 },
        { text: "b", predictedScore: 0.5 },
        { text: "c", predictedScore: 0.8 },
      ],
      0.7,
    );
    expect(picked?.text).toBe("c");
  });

  it("breaks ties in favor of the earlier candidate", async () => {
    const { pickClosest } = await loadAutoFix();
    const picked = pickClosest(
      [
        { text: "first", predictedScore: 0.4 },
        { text: "second", predictedScore: 0.6 },
      ],
      0.5,
    );
    expect(picked?.text).toBe("first");
  });
});

describe("isMalformedRewrite", () => {
  it("flags punctuation-glued seams", async () => {
    const { isMalformedRewrite } = await loadAutoFix();
    expect(isMalformedRewrite("We moved fast.Then won.")).toBe(true);
    expect(isMalformedRewrite("things improved,even more")).toBe(true);
  });

  it("flags suspicious camel seams in prose", async () => {
    const { isMalformedRewrite } = await loadAutoFix();
    expect(isMalformedRewrite("We overcame it.sSlowly, we recovered.")).toBe(true);
  });

  it("allows normal sentence punctuation", async () => {
    const { isMalformedRewrite } = await loadAutoFix();
    expect(isMalformedRewrite("We overcame it. Slowly, we recovered.")).toBe(false);
    expect(isMalformedRewrite("Progress improved, and morale followed.")).toBe(false);
  });
});

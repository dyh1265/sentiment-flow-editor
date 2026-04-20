import { describe, expect, it } from "vitest";
import { ARCS, buildArc } from "@/lib/arcs";

describe("buildArc", () => {
  it("returns [] for n=0", () => {
    expect(buildArc("story", 0)).toEqual([]);
  });

  it("returns the first keyframe score for n=1", () => {
    expect(buildArc("story", 1)).toEqual([ARCS.story.keyframes[0].score]);
  });

  it("produces exactly n values within [-1,1]", () => {
    for (const id of ["story", "persuasive", "viralHook"] as const) {
      const values = buildArc(id, 10);
      expect(values).toHaveLength(10);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("anchors endpoints to the first and last keyframe", () => {
    const persuasive = buildArc("persuasive", 21);
    expect(persuasive[0]).toBeCloseTo(0, 5);
    expect(persuasive[persuasive.length - 1]).toBeCloseTo(0.8, 5);
  });

  it("persuasive arc is monotonically non-decreasing", () => {
    const values = buildArc("persuasive", 50);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 1e-9);
    }
  });

  it("story arc dips negative mid-way then rises", () => {
    const values = buildArc("story", 21);
    const min = Math.min(...values);
    const lastVsFirst = values[values.length - 1] - values[0];
    expect(min).toBeLessThan(-0.3);
    expect(lastVsFirst).toBeGreaterThan(0.3);
  });

  it("viral hook starts high, dips, then climbs above the start", () => {
    const values = buildArc("viralHook", 21);
    expect(values[0]).toBeGreaterThan(0.4);
    const min = Math.min(...values);
    expect(min).toBeLessThan(-0.1);
    expect(values[values.length - 1]).toBeGreaterThan(values[0]);
  });
});

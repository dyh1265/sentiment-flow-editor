export type ArcId = "story" | "persuasive" | "viralHook";

export interface ArcDefinition {
  id: ArcId;
  name: string;
  description: string;
  /** Normalized keyframes at t in [0,1] with score in [-1,1]. */
  keyframes: Array<{ t: number; score: number }>;
}

export const ARCS: Record<ArcId, ArcDefinition> = {
  story: {
    id: "story",
    name: "Story arc",
    description: "Neutral open, dip into conflict, rise to resolution.",
    keyframes: [
      { t: 0.0, score: 0.0 },
      { t: 0.25, score: -0.2 },
      { t: 0.6, score: -0.6 },
      { t: 0.85, score: 0.2 },
      { t: 1.0, score: 0.7 },
    ],
  },
  persuasive: {
    id: "persuasive",
    name: "Persuasive arc",
    description: "Gentle ramp from neutral to a confident positive close.",
    keyframes: [
      { t: 0.0, score: 0.0 },
      { t: 0.5, score: 0.4 },
      { t: 1.0, score: 0.8 },
    ],
  },
  viralHook: {
    id: "viralHook",
    name: "Viral hook arc",
    description: "High hook, sharp dip to create tension, climb to payoff.",
    keyframes: [
      { t: 0.0, score: 0.7 },
      { t: 0.3, score: -0.3 },
      { t: 0.7, score: 0.4 },
      { t: 1.0, score: 0.9 },
    ],
  },
};

/**
 * Generate `n` target scores across [0..n-1] by linearly interpolating between
 * the arc's keyframes. For n==0 returns []; for n==1 returns [keyframes[0].score].
 */
export function buildArc(id: ArcId, n: number): number[] {
  if (n <= 0) return [];
  const arc = ARCS[id];
  const kfs = arc.keyframes;
  if (n === 1) return [kfs[0].score];

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(sampleKeyframes(kfs, t));
  }
  return out;
}

function sampleKeyframes(kfs: ArcDefinition["keyframes"], t: number): number {
  if (t <= kfs[0].t) return kfs[0].score;
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].score;
  for (let i = 1; i < kfs.length; i++) {
    const prev = kfs[i - 1];
    const curr = kfs[i];
    if (t <= curr.t) {
      const span = curr.t - prev.t;
      const local = span === 0 ? 0 : (t - prev.t) / span;
      return prev.score + (curr.score - prev.score) * local;
    }
  }
  return kfs[kfs.length - 1].score;
}

"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScoredSentenceDto } from "@/lib/schemas";

interface SentimentChartProps {
  sentences: ScoredSentenceDto[];
  target?: number[] | null;
  hoveredIndex: number | null;
  onHoverSentence: (index: number | null) => void;
  weakIndices?: Set<number>;
  loading?: boolean;
  emptyMessage?: string;
}

interface ChartRow {
  index: number;
  label: string;
  actual: number;
  target: number | null;
  weak: boolean;
}

export function SentimentChart({
  sentences,
  target,
  hoveredIndex,
  onHoverSentence,
  weakIndices,
  loading,
  emptyMessage,
}: SentimentChartProps) {
  const data: ChartRow[] = sentences.map((s, i) => ({
    index: i + 1,
    label: `#${i + 1}`,
    actual: Number(s.score.toFixed(3)),
    target: target && target[i] != null ? Number(target[i].toFixed(3)) : null,
    weak: weakIndices?.has(i) ?? false,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
            />
            Analyzing…
          </span>
        ) : (
          (emptyMessage ?? "Paste some text to see the emotional flow chart.")
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      {loading ? (
        <span
          aria-hidden
          className="absolute right-3 top-3 inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
        />
      ) : null}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
          onMouseMove={(state) => {
            const idx = state?.activeTooltipIndex;
            if (typeof idx === "number") onHoverSentence(idx);
          }}
          onMouseLeave={() => onHoverSentence(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(v, name) => {
              const nice = typeof v === "number" ? v.toFixed(2) : String(v);
              const label = name === "actual" ? "Sentiment" : "Target";
              return [nice, label];
            }}
            labelFormatter={(label: string, payload: ReadonlyArray<{ payload?: ChartRow }>) => {
              const row = payload?.[0]?.payload;
              if (!row) return label;
              const txt = sentences[row.index - 1]?.text ?? "";
              return `${label} ${truncate(txt, 60)}`;
            }}
          />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
          {hoveredIndex != null && data[hoveredIndex] ? (
            <ReferenceLine x={data[hoveredIndex].label} stroke="#3b82f6" strokeOpacity={0.7} />
          ) : null}
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke="#2563eb"
            strokeWidth={2}
            isAnimationActive
            animationDuration={400}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: ChartRow }) => {
              const { cx = 0, cy = 0, index = 0, payload } = props;
              const isWeak = payload?.weak;
              const isHover = hoveredIndex === index;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isHover ? 5 : isWeak ? 4 : 3}
                  fill={isWeak ? "#f97316" : "#2563eb"}
                  stroke="#fff"
                  strokeWidth={1}
                />
              );
            }}
          />
          {target ? (
            <Line
              type="monotone"
              dataKey="target"
              name="target"
              stroke="#a855f7"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}

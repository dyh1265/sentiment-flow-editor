"use client";

import { ARCS, type ArcId } from "@/lib/arcs";

interface ArcPickerProps {
  value: ArcId | null;
  onChange: (value: ArcId | null) => void;
}

export function ArcPicker({ value, onChange }: ArcPickerProps) {
  const arcs = Object.values(ARCS);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Target arc</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={pillClass(value === null)}
      >
        None
      </button>
      {arcs.map((arc) => (
        <button
          key={arc.id}
          type="button"
          onClick={() => onChange(arc.id)}
          title={arc.description}
          className={pillClass(value === arc.id)}
        >
          {arc.name}
        </button>
      ))}
    </div>
  );
}

function pillClass(active: boolean): string {
  return [
    "rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-purple-500 bg-purple-50 text-purple-700"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  ].join(" ");
}

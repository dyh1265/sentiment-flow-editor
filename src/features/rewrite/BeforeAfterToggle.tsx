"use client";

interface BeforeAfterToggleProps {
  view: "after" | "before";
  onChange: (view: "after" | "before") => void;
  hasOriginal: boolean;
  dirty: boolean;
  onReset: () => void;
}

/**
 * Toggle that swaps the chart/editor between the user's current (after) text
 * and the originally-pasted (before) text. Disabled when the text hasn't
 * diverged from the original.
 */
export function BeforeAfterToggle({
  view,
  onChange,
  hasOriginal,
  dirty,
  onReset,
}: BeforeAfterToggleProps) {
  if (!hasOriginal) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => onChange("before")}
          disabled={!dirty}
          className={pillClass(view === "before", !dirty)}
        >
          Before
        </button>
        <button
          type="button"
          onClick={() => onChange("after")}
          className={pillClass(view === "after", false)}
        >
          After
        </button>
      </div>
      {dirty ? (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
        >
          Revert to original
        </button>
      ) : null}
    </div>
  );
}

function pillClass(active: boolean, disabled: boolean): string {
  const base = "rounded px-2.5 py-1 text-xs font-medium transition-colors";
  if (disabled) return `${base} cursor-not-allowed text-gray-300`;
  if (active) return `${base} bg-gray-900 text-white`;
  return `${base} text-gray-700 hover:bg-gray-100`;
}

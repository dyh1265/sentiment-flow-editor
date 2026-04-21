interface EmptyStateProps {
  onLoadSample: () => void;
  onPlayDemo?: () => void;
}

export function EmptyState({ onLoadSample, onPlayDemo }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-md border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
      <div>
        <h2 className="text-base font-semibold text-gray-800">No text yet</h2>
        <p className="mt-1 max-w-md text-sm text-gray-600">
          Paste or type into the editor on the left. We&apos;ll score each sentence and draw the
          emotional flow here. Pick a target arc above to find weak beats.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onPlayDemo ? (
          <button
            type="button"
            onClick={onPlayDemo}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-100"
          >
            Play demo (no key needed)
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLoadSample}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Load sample text
        </button>
      </div>
    </div>
  );
}

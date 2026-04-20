export interface SentenceSpan {
  /** Sentence text, trimmed of surrounding whitespace. */
  text: string;
  /** Inclusive start offset in the original source string. */
  start: number;
  /** Exclusive end offset in the original source string. */
  end: number;
}

// Common abbreviations that should not end a sentence when followed by `.`.
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "mt",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "approx",
  "inc",
  "ltd",
  "co",
  "u.s",
  "u.k",
]);

const SENTENCE_TERMINATORS = new Set([".", "!", "?"]);
const CLOSING_WRAPPERS = new Set(['"', "'", "\u201D", "\u2019", ")", "]", "}"]);

/**
 * Split text into sentences. Handles `.`, `!`, `?`, ellipses (`...`, `…`),
 * trailing closing quotes/brackets, and common abbreviations ("Dr.", "e.g.").
 * Blank lines always force a split.
 */
export function splitSentences(text: string): SentenceSpan[] {
  if (!text) return [];

  const spans: SentenceSpan[] = [];
  const len = text.length;
  let start = 0;
  let i = 0;

  const pushSpan = (from: number, to: number) => {
    // Trim whitespace while tracking offsets so highlights line up with source.
    let s = from;
    let e = to;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ text: text.slice(s, e), start: s, end: e });
  };

  while (i < len) {
    const ch = text[i];

    // Two consecutive newlines => hard paragraph break.
    if (ch === "\n" && text[i + 1] === "\n") {
      pushSpan(start, i);
      i += 2;
      while (i < len && /\s/.test(text[i])) i++;
      start = i;
      continue;
    }

    if (SENTENCE_TERMINATORS.has(ch) || ch === "\u2026") {
      // Collapse runs of terminators ("...", "?!", "!!!") into a single boundary.
      let j = i;
      while (j < len && (SENTENCE_TERMINATORS.has(text[j]) || text[j] === "\u2026")) j++;

      const run = text.slice(i, j);
      const runLen = j - i;
      // Ellipses mid-prose (`...` / `…`) rarely end a sentence; skip unless
      // followed by paragraph break.
      const isEllipsisRun =
        run.includes("\u2026") || (run.replace(/\./g, "").length === 0 && runLen >= 2);

      // Consume trailing closing quotes/brackets so they stick to the sentence.
      while (j < len && CLOSING_WRAPPERS.has(text[j])) j++;

      // Peek at what follows.
      let k = j;
      while (k < len && /[ \t]/.test(text[k])) k++;
      const next = text[k];

      const endsOnSingleDot = runLen === 1 && text[i] === ".";
      if (endsOnSingleDot && isAbbreviation(text, i)) {
        i = j;
        continue;
      }

      if (isEllipsisRun && next !== "\n" && k < len) {
        i = j;
        continue;
      }

      // A boundary requires either end-of-text, a newline, or an uppercase
      // letter / digit / opening quote starting the next sentence.
      const isBoundary =
        k >= len ||
        next === "\n" ||
        /[A-Z0-9"'(\[\u201C\u2018]/.test(next);

      if (isBoundary) {
        pushSpan(start, j);
        i = j;
        while (i < len && /\s/.test(text[i])) i++;
        start = i;
        continue;
      }

      i = j;
      continue;
    }

    i++;
  }

  pushSpan(start, len);
  return spans;
}

/** Check whether the `.` at position `dotIdx` closes a known abbreviation. */
function isAbbreviation(text: string, dotIdx: number): boolean {
  let s = dotIdx - 1;
  while (s >= 0 && /[A-Za-z.]/.test(text[s])) s--;
  const token = text.slice(s + 1, dotIdx).toLowerCase();
  if (!token) return false;
  return ABBREVIATIONS.has(token);
}

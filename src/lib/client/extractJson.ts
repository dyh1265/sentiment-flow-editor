"use client";

/**
 * Parse a model response that *should* be JSON, tolerating the common ways
 * non-strict providers (OpenRouter free-tier, small custom endpoints, even
 * some hosted models when `response_format` isn't fully honored) wrap the
 * payload. Returns the parsed value, or null if nothing recoverable.
 *
 * Strategies, in order:
 *   1. Raw JSON.parse — the happy path for well-behaved providers.
 *   2. Strip a surrounding markdown code fence (``` or ```json) and retry.
 *   3. Extract the first balanced {...} or [...] block from the text and
 *      retry. This handles preamble ("Sure! Here's the JSON: {...}") and
 *      trailing commentary ("{...}\nHope this helps!").
 *
 * String-aware brace matching: quoted strings inside the JSON can contain
 * braces without breaking the scan, because we only count braces outside
 * strings (with backslash-escape handling).
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;

  const direct = tryParse<T>(raw);
  if (direct !== null) return direct;

  const unfenced = stripFence(raw);
  if (unfenced !== raw) {
    const fromFence = tryParse<T>(unfenced);
    if (fromFence !== null) return fromFence;
  }

  const block = firstJsonBlock(raw);
  if (block) {
    const fromBlock = tryParse<T>(block);
    if (fromBlock !== null) return fromBlock;
  }

  return null;
}

function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Remove a single surrounding ``` or ```json fence if the whole string is
 * wrapped in one. If nothing matches, return the input unchanged.
 */
function stripFence(s: string): string {
  const trimmed = s.trim();
  const match = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1].trim() : s;
}

/**
 * Scan for the first balanced JSON object or array in `s`, respecting
 * string literals so braces-inside-strings don't confuse the counter.
 */
function firstJsonBlock(s: string): string | null {
  const openIdx = findFirstOpen(s);
  if (openIdx < 0) return null;

  const open = s[openIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(openIdx, i + 1);
    }
  }
  return null;
}

function findFirstOpen(s: string): number {
  const brace = s.indexOf("{");
  const bracket = s.indexOf("[");
  if (brace < 0) return bracket;
  if (bracket < 0) return brace;
  return Math.min(brace, bracket);
}

import { franc } from "franc-min";

export interface LanguageInfo {
  /** ISO 639-3 code, or "und" if detection failed. */
  code: string;
  /** Human-readable name, or the code itself if not in our name map. */
  name: string;
  /** True if the text is English (or we couldn't tell — err toward not warning). */
  isEnglish: boolean;
  /** True if we had enough text to make a confident call. franc needs ~10+ chars. */
  confident: boolean;
}

// ISO 639-3 codes for the most common languages we expect to encounter.
// franc returns 3-letter codes; we map a curated subset to display names.
const NAMES: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fra: "French",
  deu: "German",
  ita: "Italian",
  por: "Portuguese",
  nld: "Dutch",
  swe: "Swedish",
  nor: "Norwegian",
  dan: "Danish",
  fin: "Finnish",
  pol: "Polish",
  ces: "Czech",
  hun: "Hungarian",
  ron: "Romanian",
  ell: "Greek",
  tur: "Turkish",
  rus: "Russian",
  ukr: "Ukrainian",
  bul: "Bulgarian",
  srp: "Serbian",
  heb: "Hebrew",
  arb: "Arabic",
  ara: "Arabic",
  pes: "Persian",
  hin: "Hindi",
  ben: "Bengali",
  tam: "Tamil",
  tel: "Telugu",
  tha: "Thai",
  vie: "Vietnamese",
  ind: "Indonesian",
  msa: "Malay",
  zsm: "Malay",
  cmn: "Chinese",
  jpn: "Japanese",
  kor: "Korean",
};

/**
 * Detect the language of a text blob. Returns { code: "und", isEnglish: true }
 * for very short or ambiguous input so the UI doesn't nag users about 3-word
 * inputs. Callers should treat `isEnglish === true` as "no warning needed".
 */
export function detectLanguage(text: string): LanguageInfo {
  const trimmed = text.trim();
  // franc needs at least ~10 characters to make a meaningful guess. Below that,
  // don't claim anything: say it's English/undetermined so we don't nag.
  if (trimmed.length < 10) {
    return { code: "und", name: "Unknown", isEnglish: true, confident: false };
  }
  const code = franc(trimmed);
  if (code === "und") {
    return { code, name: "Unknown", isEnglish: true, confident: false };
  }
  const name = NAMES[code] ?? code.toUpperCase();
  return {
    code,
    name,
    isEnglish: code === "eng",
    confident: true,
  };
}

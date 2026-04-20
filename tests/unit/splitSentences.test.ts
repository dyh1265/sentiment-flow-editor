import { describe, expect, it } from "vitest";
import { splitSentences } from "@/lib/splitSentences";

describe("splitSentences", () => {
  it("returns [] for empty input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n\n  ")).toEqual([]);
  });

  it("splits on basic terminators", () => {
    const res = splitSentences("Hello world. How are you? I am fine!");
    expect(res.map((s) => s.text)).toEqual([
      "Hello world.",
      "How are you?",
      "I am fine!",
    ]);
  });

  it("preserves offsets so highlights line up with source text", () => {
    const src = "First. Second.";
    const res = splitSentences(src);
    expect(res).toHaveLength(2);
    expect(src.slice(res[0].start, res[0].end)).toBe("First.");
    expect(src.slice(res[1].start, res[1].end)).toBe("Second.");
  });

  it("keeps ellipses (... and \u2026) within a single sentence when followed by continuation", () => {
    const res = splitSentences("Well... I guess so.");
    expect(res.map((s) => s.text)).toEqual(["Well... I guess so."]);

    const res2 = splitSentences("Maybe\u2026 next time.");
    expect(res2.map((s) => s.text)).toEqual(["Maybe\u2026 next time."]);
  });

  it("does not split on common abbreviations", () => {
    const res = splitSentences("Dr. Smith arrived. He was late.");
    expect(res.map((s) => s.text)).toEqual(["Dr. Smith arrived.", "He was late."]);

    const res2 = splitSentences("We use e.g. apples and oranges. That works.");
    expect(res2.map((s) => s.text)).toEqual([
      "We use e.g. apples and oranges.",
      "That works.",
    ]);
  });

  it("keeps trailing quotes and brackets attached to the sentence", () => {
    const res = splitSentences('"This is great." She smiled.');
    expect(res.map((s) => s.text)).toEqual(['"This is great."', "She smiled."]);
  });

  it("treats double newlines as hard boundaries even without punctuation", () => {
    const res = splitSentences("Just a fragment\n\nAnother block here.");
    expect(res.map((s) => s.text)).toEqual([
      "Just a fragment",
      "Another block here.",
    ]);
  });

  it("collapses runs of terminators (?! !!!)", () => {
    const res = splitSentences("Really?! Yes!!! Okay.");
    expect(res.map((s) => s.text)).toEqual(["Really?!", "Yes!!!", "Okay."]);
  });

  it("handles text without any terminator as a single sentence", () => {
    const res = splitSentences("no punctuation here");
    expect(res.map((s) => s.text)).toEqual(["no punctuation here"]);
  });
});

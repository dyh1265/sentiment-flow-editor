import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/client/extractJson";

describe("extractJson", () => {
  it("parses clean JSON directly", () => {
    expect(extractJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips a ```json ... ``` fence around the payload", () => {
    const raw = '```json\n{"sentences":[{"index":0,"score":-0.2}]}\n```';
    expect(extractJson(raw)).toEqual({
      sentences: [{ index: 0, score: -0.2 }],
    });
  });

  it("strips a bare ``` ... ``` fence without a language tag", () => {
    const raw = '```\n{"ok":true}\n```';
    expect(extractJson(raw)).toEqual({ ok: true });
  });

  it("extracts the first balanced object when there is preamble text", () => {
    const raw =
      'Sure! Here is the analysis you asked for:\n{"sentences":[{"index":0,"score":0.5}]}';
    expect(extractJson(raw)).toEqual({
      sentences: [{ index: 0, score: 0.5 }],
    });
  });

  it("extracts the first balanced object when there is trailing commentary", () => {
    const raw = '{"text":"corrected"}\n\nHope this helps!';
    expect(extractJson(raw)).toEqual({ text: "corrected" });
  });

  it("handles nested braces inside strings without losing count", () => {
    // The string value contains a { and a } which should NOT confuse the
    // balanced-brace scanner. If it did, we'd slice off the closing brace
    // early and JSON.parse would fail.
    const raw = 'noise {"q":"not a { real brace } here","n":1} trailing';
    expect(extractJson(raw)).toEqual({
      q: "not a { real brace } here",
      n: 1,
    });
  });

  it("handles escaped quotes inside strings", () => {
    const raw = 'prefix {"msg":"she said \\"hi\\""} suffix';
    expect(extractJson(raw)).toEqual({ msg: 'she said "hi"' });
  });

  it("returns null when nothing JSON-like is present", () => {
    expect(extractJson("just some plain text")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  it("returns null when the object is unterminated", () => {
    expect(extractJson('{"a":1, "b":[1,2')).toBeNull();
  });

  it("prefers the object over a stray open bracket that appears first", () => {
    // If both { and [ appear, we pick whichever comes first. Here, [ wins.
    const raw = 'noise [1,2,3] then {"x":1}';
    expect(extractJson(raw)).toEqual([1, 2, 3]);
  });
});

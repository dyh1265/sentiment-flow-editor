import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/lib/detectLanguage";

describe("detectLanguage", () => {
  it("is non-confident for very short input and defaults to English", () => {
    const info = detectLanguage("Hi");
    expect(info.confident).toBe(false);
    expect(info.isEnglish).toBe(true);
  });

  it("identifies an English paragraph", () => {
    const info = detectLanguage(
      "We started the project full of hope. Then the first prototype failed spectacularly.",
    );
    expect(info.confident).toBe(true);
    expect(info.isEnglish).toBe(true);
    expect(info.code).toBe("eng");
  });

  it("flags a Romance-language paragraph as not English", () => {
    // franc-min sometimes confuses close Romance relatives (Spanish vs
    // Portuguese) on short samples; we only care that it's confidently
    // non-English so the warning banner fires.
    const info = detectLanguage(
      "Empezamos el proyecto llenos de esperanza. Luego el primer prototipo falló espectacularmente.",
    );
    expect(info.confident).toBe(true);
    expect(info.isEnglish).toBe(false);
  });

  it("identifies Chinese and flags it as not English", () => {
    const info = detectLanguage(
      "我们满怀希望地开始了这个项目。然后第一个原型惨败。我们继续努力。",
    );
    expect(info.confident).toBe(true);
    expect(info.isEnglish).toBe(false);
    expect(info.code).toBe("cmn");
  });
});

import { describe, expect, it } from "vitest";
import { LOCALES, translateInstruction, translationLocale } from "@/lib/i18n";
import { mockRewrite } from "@/lib/mock";
import { SAMPLE_DOC } from "@/lib/sample";

describe("translation instructions", () => {
  it("round-trip for every locale and reject anything else", () => {
    for (const { id } of LOCALES) expect(translationLocale(translateInstruction(id))).toBe(id);
    expect(translationLocale("Make this shorter.")).toBeNull();
  });
});

describe("mockRewrite", () => {
  it("swaps in the canned translation only for the whole document", () => {
    const pt = translateInstruction("pt-BR");
    expect(mockRewrite(SAMPLE_DOC, pt, true)).toMatch(/^# Plano de lançamento/);
    // A selection that starts with the sample's title must not become the whole canned document.
    const title = SAMPLE_DOC.split("\n")[0];
    expect(mockRewrite(title, pt, false)).toBe(`${title} (pt-BR)`);
  });

  it("keeps the target's trailing whitespace when it can only add a marker", () => {
    expect(mockRewrite("Hello world.", translateInstruction("zh-CN"), true)).toBe("Hello world.\n\n(zh-CN)");
    expect(mockRewrite("Hello world.\n", translateInstruction("zh-CN"), true)).toBe("Hello world.\n\n(zh-CN)\n");
  });
});

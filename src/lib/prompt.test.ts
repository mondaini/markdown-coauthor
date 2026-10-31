import { describe, expect, it } from "vitest";
import { buildMessages, cleanReply } from "@/lib/prompt";

const doc = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n";

describe("buildMessages", () => {
  it("puts the instruction after the text, so small models don't ignore it on long documents", () => {
    const [system, user] = buildMessages({ document: doc, selection: null, instruction: "Translate it", model: "m", history: [] });
    expect(system.role).toBe("system");
    expect(user.content.indexOf("<target>")).toBeLessThan(user.content.indexOf("<instruction>"));
    expect(user.content.endsWith("Return only the revised document.")).toBe(true);
  });

  it("sends a selection with its context and replays refine rounds in order", () => {
    const from = doc.indexOf("Second");
    const messages = buildMessages({
      document: doc,
      selection: { from, to: doc.length - 1 },
      instruction: "Even shorter",
      model: "m",
      history: [
        { instruction: "Shorten", proposal: "Second." },
        { instruction: "Keep the word paragraph", proposal: "Second para." },
      ],
    });
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);
    expect(messages[1].content).toContain("<context_before>");
    expect(messages[1].content).toContain("<target>\nSecond paragraph.\n</target>");
    expect(messages[1].content).toContain("<instruction>\nShorten\n</instruction>"); // the first round's instruction
    expect(messages[3].content).toMatch(/^Not quite\. Keep the word paragraph/);
    expect(messages[5].content).toMatch(/^Not quite\. Even shorter/);
  });
});

describe("cleanReply", () => {
  it("strips a code fence and restores the target's leading and trailing newlines", () => {
    expect(cleanReply("```markdown\nShorter text.\n```", "\nLong text.\n\n")).toBe("\nShorter text.\n\n");
  });
});

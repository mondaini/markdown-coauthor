// ponytail: fake co-author for MOCK_AI=1 so UI and diff work costs $0.
// Deterministic, produces visible diffs on ordinary prose.
export function mockRewrite(target: string, instruction: string): string {
  const ask = instruction.toLowerCase();
  let out = target
    .replace(/\b(very|really|just|quite|basically|actually)\s+/gi, "")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\butili[sz]e\b/gi, "use")
    .replace(/\ba lot of\b/gi, "many");

  if (/short|concise|tight/.test(ask)) out = dropLastSentence(out);
  if (/expand|longer|example/.test(ask)) {
    out = out.replace(/(\S)(\s*)$/, "$1 For example, this is where a concrete detail would go.$2");
  }
  if (/formal/.test(ask)) {
    out = out
      .replace(/\bcan't\b/gi, "cannot")
      .replace(/\bdon't\b/gi, "do not")
      .replace(/\bit's\b/gi, "it is");
  }
  if (/casual/.test(ask)) {
    out = out.replace(/\bcannot\b/gi, "can't").replace(/\bdo not\b/gi, "don't");
  }
  if (out === target) out = target.replace(/(\S)(\s*)$/, "$1 (Reviewed by the mock co-author.)$2");
  return out;
}

function dropLastSentence(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!sentences || sentences.length < 2) return text;
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return sentences.slice(0, -1).join("").trimEnd() + trailing;
}

export type Range = { from: number; to: number };
export type HistoryStep = { instruction: string; proposal: string };

export type SuggestRequest = {
  document: string;
  /** null means "work on the whole document" */
  selection: Range | null;
  instruction: string;
  model: string;
  /** earlier rounds of this same suggestion, oldest first (for "refine") */
  history: HistoryStep[];
};

export type Message = { role: "system" | "user" | "assistant"; content: string };

const CONTEXT_CHARS = 400;
export const MAX_WHOLE_DOC_CHARS = 20_000;
export const MAX_HISTORY = 6;

const SYSTEM = `You are a co-author editing a Markdown document together with its writer.
You receive the writer's instruction, the exact text to work on (the target) and some surrounding context.

Rules:
- Return ONLY the revised target text. No preamble, no explanation, no code fences.
- Change only what the instruction calls for. Keep the writer's voice, facts, structure and Markdown formatting unless asked otherwise.
- Keep the target's leading and trailing whitespace and line breaks so it drops back into place.
- If the instruction does not apply to this text, return the target unchanged.`;

export function splitDocument(document: string, selection: Range | null) {
  if (!selection || selection.from === selection.to) {
    return { before: "", target: document, after: "", whole: true };
  }
  const { from, to } = selection;
  return {
    before: document.slice(Math.max(0, from - CONTEXT_CHARS), from),
    target: document.slice(from, to),
    after: document.slice(to, to + CONTEXT_CHARS),
    whole: false,
  };
}

function outline(document: string) {
  return document
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .join("\n");
}

export function buildMessages(req: SuggestRequest): Message[] {
  const { before, target, after, whole } = splitDocument(req.document, req.selection);
  const what = whole ? "document" : "target";
  const firstInstruction = req.history[0]?.instruction ?? req.instruction;

  const parts = [`<instruction>\n${firstInstruction}\n</instruction>`];
  if (!whole) {
    const headings = outline(req.document);
    if (headings) parts.push(`<document_outline>\n${headings}\n</document_outline>`);
    if (before) parts.push(`<context_before>\n${before}\n</context_before>`);
  }
  parts.push(`<target>\n${target}\n</target>`);
  if (!whole && after) parts.push(`<context_after>\n${after}\n</context_after>`);
  parts.push(`Return only the revised ${what}.`);

  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: parts.join("\n\n") },
  ];

  const refine = (instruction: string): Message => ({
    role: "user",
    content: `Not quite. ${instruction}\nReturn only the revised ${what}.`,
  });
  req.history.forEach((step, i) => {
    if (i > 0) messages.push(refine(step.instruction));
    messages.push({ role: "assistant", content: step.proposal });
  });
  if (req.history.length) messages.push(refine(req.instruction));

  return messages;
}

/** Rewrites are output-heavy; allow ~2x the target plus headroom, never unbounded. */
export function maxTokensFor(target: string) {
  return Math.min(8192, Math.ceil(target.length / 4) * 2 + 300);
}

/** Models occasionally wrap output in fences or drop the trailing newline. Put it back. */
export function cleanReply(reply: string, target: string) {
  let text = reply.replace(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/, "$1");
  const trailing = target.match(/\n*$/)?.[0] ?? "";
  text = text.replace(/\n*$/, trailing);
  const leading = target.match(/^\n*/)?.[0] ?? "";
  text = text.replace(/^\n*/, leading);
  return text;
}

import { NextResponse } from "next/server";
import { isModelId } from "@/lib/models";
import {
  MAX_HISTORY,
  MAX_WHOLE_DOC_CHARS,
  buildMessages,
  cleanReply,
  maxTokensFor,
  splitDocument,
  type SuggestRequest,
} from "@/lib/prompt";
import { chat, getBudget, invalidateBudget } from "@/lib/openrouter";
import { mockRewrite } from "@/lib/mock";

export const maxDuration = 60;

/** Stop serving the public demo before the shared key hits its cap. */
const BUDGET_FLOOR_USD = 0.5;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<SuggestRequest> | null;
  const problem = validate(body);
  if (problem) return NextResponse.json({ error: "invalid_request", detail: problem }, { status: 400 });
  const input = body as SuggestRequest;

  const { target, whole } = splitDocument(input.document, input.selection);
  if (whole && target.length > MAX_WHOLE_DOC_CHARS) {
    return NextResponse.json({ error: "document_too_long" }, { status: 400 });
  }

  if (process.env.MOCK_AI === "1") {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ text: cleanReply(mockRewrite(target, input.instruction, whole), target), cost: 0 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "missing_key" }, { status: 500 });
  }

  try {
    const budget = await getBudget();
    if (budget.remaining !== null && budget.remaining < BUDGET_FLOOR_USD) {
      return NextResponse.json(
        { error: "budget_exhausted", remaining: budget.remaining },
        { status: 402 },
      );
    }
    const { text, cost } = await chat(input.model, buildMessages(input), maxTokensFor(target));
    invalidateBudget();
    return NextResponse.json({ text: cleanReply(text, target), cost });
  } catch (e) {
    console.error("suggest: upstream failed", e); // raw detail stays in server logs
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}

function validate(b: Partial<SuggestRequest> | null): string | null {
  if (!b) return "Invalid JSON body.";
  if (typeof b.document !== "string") return "document must be a string.";
  if (typeof b.instruction !== "string" || !b.instruction.trim()) return "instruction is required.";
  if (b.instruction.length > 2000) return "instruction is too long.";
  if (!isModelId(b.model)) return "Unknown model.";
  if (b.selection !== null && b.selection !== undefined) {
    const { from, to } = b.selection;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > b.document.length) {
      return "selection must be a valid {from, to} range or null.";
    }
  }
  if (!Array.isArray(b.history) || b.history.length > MAX_HISTORY) {
    return `history must be an array of at most ${MAX_HISTORY} steps.`;
  }
  if (b.history.some((h) => typeof h?.instruction !== "string" || typeof h?.proposal !== "string")) {
    return "history steps need instruction and proposal strings.";
  }
  return null;
}

// Server-only. Plain fetch against OpenRouter; no SDK needed for two endpoints.
import type { Message } from "./prompt";

const BASE = "https://openrouter.ai/api/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "X-Title": "Co-author",
  };
}

export async function chat(model: string, messages: Message[], maxTokens: number) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    text: (data.choices?.[0]?.message?.content as string | undefined) ?? "",
    cost: (data.usage?.cost as number | undefined) ?? 0,
  };
}

export type Budget = {
  limit: number | null;
  usage: number;
  remaining: number | null;
};

// Note: module-level 30s cache; Fluid Compute reuses instances so it mostly hits.
let cached: { at: number; budget: Budget } | null = null;

export async function getBudget(): Promise<Budget> {
  if (cached && Date.now() - cached.at < 30_000) return cached.budget;
  const res = await fetch(`${BASE}/key`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`OpenRouter key check failed (${res.status})`);
  const { data } = await res.json();
  const budget: Budget = {
    limit: data.limit ?? null,
    usage: data.usage ?? 0,
    remaining: data.limit_remaining ?? null,
  };
  cached = { at: Date.now(), budget };
  return budget;
}

export function invalidateBudget() {
  cached = null;
}

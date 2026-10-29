// The curated model menu. Everything the API accepts must be in this list,
// so a client can't point the demo key at an expensive model.
export const MODELS = [
  {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    tier: "Fast",
    price: "$0.10 in / $0.50 out per 1M tokens",
  },
  {
    id: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
    tier: "Fast",
    price: "$0.10 in / $0.50 out per 1M tokens",
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    tier: "Quality",
    price: "$2 in / $10 out per 1M tokens, about 20x the Fast tier",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = MODELS[0].id;

export function isModelId(id: unknown): id is ModelId {
  return MODELS.some((m) => m.id === id);
}

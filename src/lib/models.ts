// The curated model menu. Everything the API accepts must be in this list,
// so a client can't point the demo key at an expensive model.
export const MODELS = [
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", tier: "fast" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", tier: "fast" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", tier: "quality" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = MODELS[0].id;

export function isModelId(id: unknown): id is ModelId {
  return MODELS.some((m) => m.id === id);
}

/** Assignable chat choices. Google and memory processing keep their Vertex clients. */
export const CHAT_MODELS = [
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini",
    provider: "vertex",
    reasoning: "default",
    images: true,
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    provider: "openrouter",
    reasoning: "high",
    images: true,
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    provider: "openrouter",
    reasoning: "high",
    images: true,
  },
  {
    id: "qwen/qwen3.8-max-0902",
    name: "Qwen3.8 Max 0902",
    provider: "openrouter",
    reasoning: "high",
    images: true,
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    provider: "openrouter",
    reasoning: "thinking",
    images: true,
  },
] as const;

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0];

export function getChatModel(id: string = DEFAULT_CHAT_MODEL.id) {
  const model = CHAT_MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error("Unsupported chat model");
  return model;
}

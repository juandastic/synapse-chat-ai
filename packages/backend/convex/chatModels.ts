/** Explicit chat choices. Memory processing continues to use Cortex's Gemini clients. */
export const CHAT_MODELS = [
  { id: "gemini-3.1-pro-preview", name: "Gemini", provider: "vertex", reasoning: "default", images: true },
  { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "openrouter", reasoning: "high", images: true },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", provider: "openrouter", reasoning: "high", images: true },
  { id: "deepseek/deepseek-v4-pro-0813", name: "DeepSeek V4 Pro 0813", provider: "openrouter", reasoning: "high", images: false },
  { id: "qwen/qwen3.7-max", name: "Qwen3.7 Max", provider: "openrouter", reasoning: "thinking", images: false },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", provider: "openrouter", reasoning: "thinking", images: true },
] as const;

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0];

export function getChatModel(id: string = DEFAULT_CHAT_MODEL.id) {
  const model = CHAT_MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error("Unsupported chat model");
  return model;
}

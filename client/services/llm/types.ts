// client/services/llm/types.ts
// Shared types for the LLM provider registry. No runtime code — keep this
// file import-free (no provider files, no dispatcher) so it can be imported
// anywhere without cycles.

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'aihubmix'
  | 'custom'

export type LlmConfig = {
  provider: ProviderId
  apiKey: string
  model: string
  baseUrl?: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ReferenceImage = {
  data: string
  mimeType: string
}

export type Capabilities = { chat: boolean; image: boolean }

export type ModelDef = {
  id: string
  label: string
  /** Per-model capability override. Falls back to provider-level when omitted. */
  capabilities?: Partial<Capabilities>
}

export type ProviderDef = {
  id: ProviderId
  label: string
  baseUrl?: string
  defaultModel: string
  models: ReadonlyArray<ModelDef>
  apiKeyHint: string
  apiKeyHelpUrl?: string
  capabilities: Capabilities
  /** Override default 8192-token cap for openai-compat chat. */
  maxOutputTokens?: number

  // Optional overrides — dispatcher falls back to openai-compat when omitted.
  streamChat?: (
    messages: ChatMessage[],
    systemPrompt: string,
    config: LlmConfig,
  ) => AsyncGenerator<string>

  generateImage?: (
    prompt: string,
    config: LlmConfig,
    referenceImages?: ReferenceImage[],
  ) => Promise<string | null>
}

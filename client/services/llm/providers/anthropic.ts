// client/services/llm/providers/anthropic.ts
import type { ChatMessage, LlmConfig, ProviderDef } from '../types'

async function* anthropicStreamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  config: LlmConfig,
): AsyncGenerator<string> {
  const url = 'https://api.anthropic.com/v1/messages'
  const body = {
    model: config.model,
    stream: true,
    system: systemPrompt,
    messages,
    max_tokens: 8192,
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Anthropic API error ${resp.status}: ${err}`)
  }
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine.startsWith('data: ')) continue
      try {
        const data = JSON.parse(trimmedLine.slice(6))
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text
        }
      } catch {
        // ignore mid-stream parse errors
      }
    }
  }
}

export const anthropicProvider: ProviderDef = {
  id: 'anthropic',
  label: 'Anthropic',
  defaultModel: 'claude-sonnet-4-5',
  models: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  apiKeyHint: 'console.anthropic.com/settings/keys',
  apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
  capabilities: { chat: true, image: false },
  streamChat: anthropicStreamChat,
}

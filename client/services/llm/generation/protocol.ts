import type { GenerationUsage } from '../../../../shared/contract/workshop-generation'
import type { LlmConfig } from '../types'
import { assertGenerationAdmission, resolveGenerationTarget, type GenerationTarget } from './admission'

/** Opaque protocol state: never place these objects in React recovery or drafts. */
export type WireMessage = Record<string, unknown> & { role: 'system' | 'user' | 'assistant' | 'tool' }
export type ToolCall = Record<string, unknown> & {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export type ToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export type ModelTurn = {
  message: WireMessage
  calls: ToolCall[]
  text: string
  finishReason: string
  returnedModel?: string
  requestId?: string
  usage: GenerationUsage
}

export const UNKNOWN_USAGE: GenerationUsage = { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }
export const GENERATION_MODEL_SETTINGS = Object.freeze({ max_tokens: 16384, stream: true, stream_options: { include_usage: true } })

export class ModelTurnError extends Error {
  readonly kind: 'network' | 'http' | 'protocol' | 'incomplete' | 'cancelled'
  readonly usage: GenerationUsage
  constructor(kind: ModelTurnError['kind'], message: string, usage = UNKNOWN_USAGE) {
    super(message)
    this.kind = kind
    this.usage = { ...usage }
  }
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

function readUsage(value: unknown): GenerationUsage {
  const raw = object(value)
  return {
    inputTokens: numberOrNull(raw.prompt_tokens), outputTokens: numberOrNull(raw.completion_tokens),
    cachedInputTokens: numberOrNull(raw.prompt_cache_hit_tokens ?? object(raw.prompt_tokens_details).cached_tokens),
    reasoningTokens: numberOrNull(object(raw.completion_tokens_details).reasoning_tokens),
  }
}

/** Text/argument/reasoning fragments concatenate; identities must not change.
 * Indexed provider arrays retain their order and every opaque field, including
 * Gemini extra_content and OpenRouter encrypted reasoning/signatures.
 */
function mergeDelta(target: Record<string, unknown>, delta: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(delta)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ModelTurnError('protocol', 'Invalid protocol object key.')
    if (value === null || value === undefined) continue
    const field = `${path}.${key}`
    const previous = target[key]
    if (Array.isArray(value)) {
      const items = Array.isArray(previous) ? previous : []
      for (const entry of value) {
        const item = object(entry)
        if (typeof item.index === 'number' && Number.isInteger(item.index) && item.index >= 0 && item.index < 256) {
          const existing = items.find(value => object(value).index === item.index)
          if (existing) mergeDelta(object(existing), item, field)
          else { const next = { index: item.index }; mergeDelta(next, item, field); items.push(next) }
        } else if (field === '.tool_calls') throw new ModelTurnError('protocol', 'Tool delta has no valid index.')
        else items.push(structuredClone(entry))
      }
      target[key] = items
    } else if (typeof value === 'object') {
      const next = object(previous)
      mergeDelta(next, object(value), field)
      target[key] = next
    } else if (typeof value === 'string' && typeof previous === 'string') {
      const fragment = ['content', 'reasoning', 'reasoning_content', 'arguments', 'text', 'summary', 'data', 'signature', 'thought_signature'].includes(key)
        || field === '.tool_calls.function.name'
      if (fragment) target[key] = previous + value
      else if (previous !== value) throw new ModelTurnError('protocol', `Protocol identity changed at ${field}.`)
    } else target[key] = value
  }
}

export async function readModelTurn(response: Response, signal: AbortSignal, onText: (delta: string) => void = () => {}): Promise<ModelTurn> {
  if (!response.ok) throw new ModelTurnError('http', `Model request failed (HTTP ${response.status}). Retry explicitly; the previous request is not replayed automatically.`)
  if (!response.body) throw new ModelTurnError('protocol', 'The provider returned no response stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const message: WireMessage = { role: 'assistant' }
  let buffer = ''
  let data: string[] = []
  let done = false
  let finishReason = ''
  let returnedModel: string | undefined
  let requestId: string | undefined
  let usage = { ...UNKNOWN_USAGE }
  let bytes = 0
  const event = () => {
    if (!data.length) return
    const raw = data.join('\n')
    data = []
    if (raw === '[DONE]') { done = true; return }
    let frame: Record<string, unknown>
    try { frame = object(JSON.parse(raw)) } catch { throw new ModelTurnError('protocol', 'Malformed provider stream event.', usage) }
    if (frame.usage) usage = readUsage(frame.usage) // cumulative frame, never add it twice
    if (frame.error) throw new ModelTurnError('protocol', 'The provider reported an error inside the response stream.', usage)
    if (typeof frame.model === 'string') returnedModel = frame.model
    if (typeof frame.id === 'string') requestId = frame.id
    if (!Array.isArray(frame.choices)) return
    for (const value of frame.choices) {
      const choice = object(value)
      if (choice.index !== 0) throw new ModelTurnError('protocol', 'Unexpected response choice index.', usage)
      const delta = object(choice.delta)
      mergeDelta(message, delta)
      if (typeof delta.content === 'string') onText(delta.content)
      if (typeof choice.finish_reason === 'string') {
        if (finishReason && finishReason !== choice.finish_reason) throw new ModelTurnError('protocol', 'Conflicting finish reasons.', usage)
        finishReason = choice.finish_reason
      }
    }
  }
  const lines = (eof = false) => {
    while (buffer) {
      const match = /\r\n|\r|\n/.exec(buffer)
      if (!match) break
      if (!eof && match[0] === '\r' && match.index === buffer.length - 1) break
      const line = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      if (!line) event()
      else if (line === 'data' || line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      if (done) break
    }
  }
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (!done) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) {
        buffer += decoder.decode()
        lines(true)
        break
      }
      bytes += chunk.value.byteLength
      if (bytes > 2 * 1024 * 1024) throw new ModelTurnError('protocol', 'Provider response exceeds the stream limit.', usage)
      buffer += decoder.decode(chunk.value, { stream: true })
      lines()
    }
    if (!done || !finishReason) throw new ModelTurnError('incomplete', 'The model stream ended without a complete terminal response.', usage)
    if (!['stop', 'tool_calls'].includes(finishReason)) throw new ModelTurnError('incomplete', `Model output did not complete (${finishReason}).`, usage)
    const calls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).sort((a, b) => Number(object(a).index) - Number(object(b).index)).map(value => {
      const call = object(value)
      const fn = object(call.function)
      if (typeof call.id !== 'string' || !call.id || call.type !== 'function' || typeof fn.name !== 'string' || !fn.name || typeof fn.arguments !== 'string') {
        throw new ModelTurnError('protocol', 'Incomplete tool call identity or arguments.', usage)
      }
      const { index: _index, ...withoutIndex } = call
      return withoutIndex as ToolCall
    })
    if (new Set(calls.map(call => call.id)).size !== calls.length) throw new ModelTurnError('protocol', 'Duplicate tool call IDs.', usage)
    if ((finishReason === 'tool_calls') !== (calls.length > 0)) throw new ModelTurnError('protocol', 'Tool calls and finish reason disagree.', usage)
    if (calls.length) message.tool_calls = calls
    const text = typeof message.content === 'string' ? message.content : ''
    if (!calls.length && !text.trim()) throw new ModelTurnError('protocol', 'The provider returned no final content.', usage)
    if (message.content === undefined) message.content = null
    return { message, calls, text, finishReason, returnedModel, requestId, usage }
  } catch (error) {
    if (signal.aborted) throw new ModelTurnError('cancelled', 'Model request interrupted; usage may be unknown.', usage)
    if (error instanceof ModelTurnError) throw error
    throw new ModelTurnError('network', 'The model response stream was interrupted; retry explicitly.', usage)
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export type ToolTransport = {
  target: GenerationTarget
  complete(messages: readonly WireMessage[], tools: readonly ToolDefinition[], signal: AbortSignal, onText?: (text: string) => void): Promise<ModelTurn>
}

/** I/O and admission are seams for the browser acceptance harness. Production
 * uses the default exact-tuple policy; there is no product bypass setting.
 * Only this closure owns the LLM credential. No GitHub/backend port receives it.
 */
export function createToolTransport(config: LlmConfig, options: {
  fetch?: typeof fetch
  authorize?: (target: GenerationTarget) => void
  beforePost?: (body: string) => Promise<void>
} = {}): ToolTransport {
  const captured = { ...config }
  const target = Object.freeze(resolveGenerationTarget(captured))
  const authorize = options.authorize ?? assertGenerationAdmission
  authorize(target)
  const fetchModel = options.fetch ?? fetch
  let active = false
  return {
    target,
    async complete(messages, tools, signal, onText) {
      authorize(target) // check the resolved transport destination, not just UI selection
      if (!captured.apiKey) throw new Error('Configure your model API key in this browser.')
      if (active) throw new Error('Only one model request may run at a time.')
      const body = JSON.stringify({
        model: target.model, messages, ...GENERATION_MODEL_SETTINGS,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        ...(target.provider === 'deepseek' ? { thinking: { type: 'enabled' } } : { temperature: 0.2 }),
        ...(target.provider === 'openrouter' ? { provider: { require_parameters: true } } : {}),
      })
      active = true
      try {
        signal.throwIfAborted()
        await options.beforePost?.(body)
        signal.throwIfAborted()
        let response: Response
        try {
          response = await fetchModel(target.endpoint, {
            method: 'POST', headers: { Authorization: `Bearer ${captured.apiKey}`, 'Content-Type': 'application/json' },
            credentials: 'omit', redirect: 'error', cache: 'no-store', body, signal,
          })
        } catch {
          throw new ModelTurnError(signal.aborted ? 'cancelled' : 'network', 'Model request interrupted or unreachable. It was not retried automatically.')
        }
        return await readModelTurn(response, signal, onText)
      } finally { active = false }
    },
  }
}

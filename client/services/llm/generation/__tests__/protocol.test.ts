import { describe, expect, it, vi } from 'vitest'
import { createToolTransport, MODEL_STREAM_LIMITS, readModelTurn, resolveGenerationTarget } from '../protocol'
import { REFERENCE_TOOLS } from '../references'

const signal = () => new AbortController().signal
const frame = (delta: unknown, finish: string | null = null) => ({ id: 'response-1', model: 'returned-model', choices: [{ index: 0, delta, finish_reason: finish }] })
function stream(frames: unknown[], done = true): Response {
  const text = ': keepalive\r\n\r\n' + frames.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join('') + (done ? 'data: [DONE]\r\n\r\n' : '')
  const bytes = new TextEncoder().encode(text)
  let index = 0
  return new Response(new ReadableStream({ pull(controller) { if (index === bytes.length) controller.close(); else controller.enqueue(bytes.slice(index, ++index)) } }))
}

describe('browser model protocol', () => {
  it('accepts bounded long output whose repeated SSE metadata exceeds 2 MiB on the wire', async () => {
    const count = 16300
    const token = `data: ${JSON.stringify({ ...frame({ reasoning_content: 'x' }), created: 1791400000, object: 'chat.completion.chunk', system_fingerprint: 'provider-metadata-repeated-per-token' })}\n\n`
    const body = token.repeat(count) + `data: ${JSON.stringify(frame({ content: 'complete source' }, 'stop'))}\n\ndata: [DONE]\n\n`
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(2 * 1024 * 1024)
    const result = await readModelTurn(new Response(body), signal())
    expect(result.message.reasoning_content).toHaveLength(count)
    expect(result.text).toBe('complete source')
    expect(result.responseWireBytes).toBe(new TextEncoder().encode(body).byteLength)
  })

  it('still rejects an oversized assembled payload and an unterminated oversized event', async () => {
    const part = `data: ${JSON.stringify(frame({ reasoning_content: 'x'.repeat(MODEL_STREAM_LIMITS.messageBytes / 2 + 1) }))}\n\n`
    await expect(readModelTurn(new Response(part + part + 'data: [DONE]\n\n'), signal())).rejects.toMatchObject({
      kind: 'protocol', message: expect.stringContaining('payload limit'), requestId: 'response-1', returnedModel: 'returned-model', responseWireBytes: expect.any(Number),
    })
    await expect(readModelTurn(new Response('data: ' + 'x'.repeat(MODEL_STREAM_LIMITS.eventBytes)), signal())).rejects.toThrow('event limit')
  })
  it('retains interleaved calls, Unicode, reasoning and late signatures in the next POST', async () => {
    const fetchModel = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([
      frame({ role: 'assistant', content: '查', reasoning_content: 'think ', tool_calls: [{ index: 1, id: 'second', type: 'function', function: { name: 'read_reference', arguments: '{"path":' } }, { index: 0, id: 'first', type: 'function', function: { name: 'search_references', arguments: '{"que' } }] }),
      frame({ content: '资料', reasoning_content: 'more', reasoning_details: [{ index: 0, id: 'r', type: 'reasoning.text', text: 'reason ' }], tool_calls: [{ index: 0, function: { arguments: 'ry":"wood"}' } }, { index: 1, function: { arguments: '"docs/CUSTOM_CARD_SANDBOX.md"}' }, extra_content: { google: { thought_signature: 'opaque-signature' } } }] }),
      frame({ reasoning_details: [{ index: 0, text: 'continued', signature: 'signed' }, { index: 1, type: 'reasoning.encrypted', data: 'encrypted' }] }, 'tool_calls'),
      { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7, prompt_cache_hit_tokens: 2, completion_tokens_details: { reasoning_tokens: 3 } } },
    ])).mockResolvedValueOnce(stream([frame({ content: 'finished' }, 'stop')]))
    const transport = createToolTransport({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'token-canary' }, { fetch: fetchModel })
    const visible: string[] = []
    const turn = await transport.complete([{ role: 'user', content: 'request' }], REFERENCE_TOOLS, signal(), text => visible.push(text))
    expect(visible.join('')).toBe('查资料')
    expect(turn.calls.map(call => call.id)).toEqual(['first', 'second'])
    expect(turn.calls[1]).toMatchObject({ function: { arguments: '{"path":"docs/CUSTOM_CARD_SANDBOX.md"}' }, extra_content: { google: { thought_signature: 'opaque-signature' } } })
    expect(turn.message).toMatchObject({ reasoning_content: 'think more', reasoning_details: [{ text: 'reason continued', signature: 'signed' }, { data: 'encrypted' }] })
    expect(turn.usage).toEqual({ inputTokens: 5, outputTokens: 7, cachedInputTokens: 2, reasoningTokens: 3 })
    await transport.complete([turn.message, ...turn.calls.map(call => ({ role: 'tool' as const, tool_call_id: call.id, content: 'result' }))], REFERENCE_TOOLS, signal(), undefined)
    const [url, init] = fetchModel.mock.calls[1]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init?.credentials).toBe('omit')
    expect(init?.redirect).toBe('error')
    expect(JSON.parse(String(init?.body))).toMatchObject({ tools: REFERENCE_TOOLS, tool_choice: 'auto', thinking: { type: 'enabled' } })
    expect(JSON.parse(String(init?.body)).messages[0]).toEqual(turn.message)
    expect(JSON.parse(String(init?.body)).messages.slice(1).map((message: { tool_call_id: string }) => message.tool_call_id)).toEqual(['first', 'second'])
    expect(String(init?.body)).not.toContain('token-canary')
  })

  it.each([
    [stream([frame({ content: 'partial' })], false), 'terminal'],
    [stream([frame({ content: 'cut off' }, 'length')]), 'length'],
    [stream([{ error: { message: 'upstream error' } }]), 'inside'],
    [stream([frame({ tool_calls: [{ index: 0, type: 'function', function: { name: 'read_reference', arguments: '{}' } }] }, 'tool_calls')]), 'identity'],
  ])('rejects incomplete responses instead of returning candidates', async (response, message) => {
    await expect(readModelTurn(response as Response, signal())).rejects.toThrow(String(message))
  })

  it('does not turn repeated usage frames into repeated tokens or requests', async () => {
    const usage = { prompt_tokens: 10, completion_tokens: 4 }
    const result = await readModelTurn(stream([frame({ content: 'answer' }, 'stop'), { choices: [], usage }, { choices: [], usage }]), signal())
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4, cachedInputTokens: null, reasoningTokens: null })
  })

  it('cancels a stalled reader and never automatically repeats a failed POST', async () => {
    const fetchModel = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'))
    const transport = createToolTransport({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test' }, { fetch: fetchModel })
    await expect(transport.complete([], [], signal())).rejects.toThrow('not retried')
    expect(fetchModel).toHaveBeenCalledTimes(1)
    const abort = new AbortController()
    const pending = readModelTurn(new Response(new ReadableStream({ start() {} })), abort.signal)
    abort.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled', usage: { inputTokens: null, outputTokens: null } })
  })

  it('sends the requested model identity even when the provider returns a different model name', async () => {
    const fetchModel = vi.fn<typeof fetch>().mockResolvedValue(stream([
      { model: 'synthetic-returned-revision', choices: [{ index: 0, delta: { content: 'complete source' }, finish_reason: 'stop' }] },
    ]))
    const transport = createToolTransport({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'browser-only-test-key' }, { fetch: fetchModel })
    const result = await transport.complete([{ role: 'user', content: 'Generate a card' }], REFERENCE_TOOLS, signal())
    expect(result.returnedModel).toBe('synthetic-returned-revision')
    expect(fetchModel).toHaveBeenCalledTimes(1)
    const [url, init] = fetchModel.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(JSON.parse(String(init?.body)).model).toBe('deepseek-flash')
  })

  it.each([
    ['deepseek', 'https://api.deepseek.com/v1/chat/completions'],
    ['openrouter', 'https://openrouter.ai/api/v1/chat/completions'],
    ['aihubmix', 'https://aihubmix.com/v1/chat/completions'],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
  ] as const)('uses the existing %s compatible endpoint without a model admission gate', (provider, endpoint) => {
    expect(resolveGenerationTarget({ provider, model: 'user-selected-model', apiKey: 'test' })).toEqual({ provider, endpoint, model: 'user-selected-model' })
    expect(createToolTransport({ provider, model: 'user-selected-model', apiKey: 'test', baseUrl: 'https://example.com/v1/' }).target.endpoint).toBe('https://example.com/v1/chat/completions')
  })

  it.each(['http://example.com/v1', 'https://user:password@example.com/v1', 'https://example.com/v1?token=secret', 'https://example.com/v1#fragment'])('rejects unsafe browser endpoints before a request: %s', baseUrl => {
    expect(() => createToolTransport({ provider: 'deepseek', model: 'selected', apiKey: 'test', baseUrl })).toThrow('HTTPS')
  })

  it('lets the host decide whether empty final text has written artifacts', async () => {
    expect(await readModelTurn(stream([frame({}, 'stop')]), signal())).toMatchObject({ calls: [], text: '', finishReason: 'stop' })
  })

  it('does not send an already cancelled request', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const transport = createToolTransport({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test' }, {
      fetch: fetchModel,
    })
    await expect(transport.complete([], [], AbortSignal.abort(new Error('Cancelled before POST')))).rejects.toMatchObject({ kind: 'preflight', message: 'Cancelled before POST' })
    expect(fetchModel).not.toHaveBeenCalled()
  })
})

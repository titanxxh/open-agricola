// client/services/llm/__tests__/dispatcher.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '../index'
import type { LlmConfig } from '../types'

function makeFakeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

function fakeOpenAISseChunks(text: string): string[] {
  // Two SSE chunks: one delta with the text, then a [DONE].
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    `data: [DONE]\n\n`,
  ]
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

describe('streamChat dispatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes openai chat to /v1/chat/completions with Bearer auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: makeFakeStream(fakeOpenAISseChunks('hello')),
    })
    const config: LlmConfig = {
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o',
    }
    const out = await collect(streamChat([{ role: 'user', content: 'hi' }], 'sys', config))
    expect(out).toBe('hello')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-test')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o')
    expect(body.stream).toBe(true)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })
})

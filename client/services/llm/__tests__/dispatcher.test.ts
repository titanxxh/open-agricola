// client/services/llm/__tests__/dispatcher.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCardArt, streamChat } from '../index'
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

  it('routes openrouter to its OpenAI-compatible base URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: makeFakeStream(fakeOpenAISseChunks('or-out')),
    })
    const config: LlmConfig = {
      provider: 'openrouter',
      apiKey: 'or-test',
      model: 'qwen/qwen3.6-plus:free',
    }
    const out = await collect(streamChat([{ role: 'user', content: 'hi' }], 'sys', config))
    expect(out).toBe('or-out')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('routes gemini chat through its OpenAI-compatible shim with 65536 max_tokens', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: makeFakeStream(fakeOpenAISseChunks('gem-out')),
    })
    const config: LlmConfig = {
      provider: 'gemini',
      apiKey: 'gem-test',
      model: 'gemini-3.1-pro-preview',
    }
    const out = await collect(streamChat([{ role: 'user', content: 'hi' }], 'sys', config))
    expect(out).toBe('gem-out')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(JSON.parse(init.body).max_tokens).toBe(65536)
  })

  it('routes deepseek to api.deepseek.com/v1 with Bearer auth and v4 model', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: makeFakeStream(fakeOpenAISseChunks('ds-out')),
    })
    const config: LlmConfig = {
      provider: 'deepseek',
      apiKey: 'sk-deepseek',
      model: 'deepseek-v4-flash',
    }
    const out = await collect(streamChat([{ role: 'user', content: 'hi' }], 'sys', config))
    expect(out).toBe('ds-out')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-deepseek')
    expect(JSON.parse(init.body).model).toBe('deepseek-v4-flash')
  })
})

describe('generateCardArt dispatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes OpenRouter image models through chat completions with image modality', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            images: [{ image_url: { url: 'data:image/png;base64,abc123' } }],
          },
        }],
      }),
    })

    const result = await generateCardArt('wooden mallet', {
      provider: 'openrouter',
      apiKey: 'or-test',
      model: 'bytedance-seed/seedream-4.5',
    })

    expect(result).toBe('data:image/png;base64,abc123')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer or-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('bytedance-seed/seedream-4.5')
    expect(body.modalities).toEqual(['image'])
    expect(body.messages[0].content).toBe('wooden mallet')
  })
})

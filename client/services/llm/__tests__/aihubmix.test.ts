import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aihubmixProvider } from '../providers/aihubmix'
import type { LlmConfig } from '../types'

const baseConfig: LlmConfig = {
  provider: 'aihubmix',
  apiKey: 'test-aihubmix-key',
  model: 'gemini-3.1-flash-image-preview-free',
}

describe('aihubmixGenerateImage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to /v1/chat/completions with bearer auth, modalities, and selected model', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            multi_mod_content: [
              { inline_data: { data: 'XXXX', mime_type: 'image/png' } },
            ],
          },
        }],
      }),
    })
    const dataUrl = await aihubmixProvider.generateImage!('a red apple', baseConfig)
    expect(dataUrl).toBe('data:image/png;base64,XXXX')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://aihubmix.com/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-aihubmix-key',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('gemini-3.1-flash-image-preview-free')
    expect(body.modalities).toEqual(['text', 'image'])
    expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'a red apple' })
  })

  it('throws an informative error on non-2xx HTTP', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    await expect(aihubmixProvider.generateImage!('x', baseConfig))
      .rejects.toMatchObject({ message: expect.stringMatching(/AiHubMix API error 401/) })
  })

  it('returns null when the response has no inline image part', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { multi_mod_content: [{ text: 'no image here' }] } }],
      }),
    })
    const result = await aihubmixProvider.generateImage!('x', baseConfig)
    expect(result).toBeNull()
  })

  it('attaches reference images as image_url parts in the user message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { multi_mod_content: [{ inline_data: { data: 'Y', mime_type: 'image/png' } }] } }],
      }),
    })
    await aihubmixProvider.generateImage!(
      'use this style',
      baseConfig,
      [{ data: 'BASE64DATA', mimeType: 'image/png' }],
    )
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.messages[0].content).toHaveLength(2)
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,BASE64DATA' },
    })
  })
})

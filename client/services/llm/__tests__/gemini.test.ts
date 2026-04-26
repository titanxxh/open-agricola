import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geminiProvider } from '../providers/gemini'
import type { LlmConfig } from '../types'

describe('geminiGenerateImage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the user-selected model in the request URL (not a hardcoded model id)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'AAAA', mimeType: 'image/png' } }],
          },
        }],
      }),
    })
    const config: LlmConfig = {
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-3.1-pro-preview',
    }
    const dataUrl = await geminiProvider.generateImage!('a red apple', config)
    expect(dataUrl).toBe('data:image/png;base64,AAAA')
    const requestUrl = fetchMock.mock.calls[0]![0] as string
    expect(requestUrl).toContain('/models/gemini-3.1-pro-preview:generateContent')
    expect(requestUrl).not.toContain('/models/gemini-3.1-flash-image-preview:generateContent')
  })
})

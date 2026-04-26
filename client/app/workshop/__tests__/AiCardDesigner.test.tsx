// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen, waitFor } from '@testing-library/react'

import { LocaleProvider } from '../../../contexts/LocaleContext'
import { AiCardDesigner } from '../AiCardDesigner'

const renderDesigner = () =>
  renderToStaticMarkup(
    <LocaleProvider>
      <AiCardDesigner onImport={() => {}} onClose={() => {}} />
    </LocaleProvider>,
  )

describe('AiCardDesigner AI config header', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows the updated title and a prominent warning when no model is configured', () => {
    const html = renderDesigner()

    expect(html).toContain('配置AI模型')
    expect(html).toContain('尚未配置任何 AI 模型')
    expect(html).toContain('图片生成：未配置')
    expect(html).toContain('能力生成：未配置')
  })

  it('offers DeepSeek alongside the default visible providers', () => {
    const html = renderDesigner()

    expect(html).toContain('Gemini')
    expect(html).toContain('OpenRouter')
    expect(html).toContain('DeepSeek')
  })

  it('shows configured provider and model in the collapsed header summary', () => {
    localStorage.setItem(
      'open-agricola-llm-config-art',
      JSON.stringify({ provider: 'gemini', apiKey: 'test', model: 'gemini-2.5-flash' }),
    )
    localStorage.setItem(
      'open-agricola-llm-config',
      JSON.stringify({ provider: 'openrouter', apiKey: 'test', model: 'qwen/qwen3.6-plus:free' }),
    )

    const html = renderDesigner()

    expect(html).toContain('图片生成：Gemini · gemini-2.5-flash')
    expect(html).toContain('能力生成：OpenRouter · qwen/qwen3.6-plus:free')
    expect(html).not.toContain('尚未配置任何 AI 模型')
  })

  it('loads the selected card into the editor when opened from detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    render(
      <LocaleProvider>
        <AiCardDesigner
          initialCard={{
            id: 'db-card-1',
            card_id: 'CUSTOM_MedievalMallet',
            card_type: 'minor',
            name: '中世纪木槌',
            description: 'desc',
            art_url: null,
            effect_code: 'const CARD_IMPL = {}',
            card_json: {
              id: 'CUSTOM_MedievalMallet',
              name: '中世纪木槌',
              card_type: 'minor',
              deck: 'CUSTOM',
              number: 0,
              desc: ['建造石屋'],
              cost: { wood: 2 },
              vp: 1,
            },
            status: 'draft',
            updated_at: Date.now(),
          }}
          onImport={() => {}}
          onClose={() => {}}
        />
      </LocaleProvider>,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('中世纪木槌')).toBeInTheDocument()
      expect(screen.getByDisplayValue('CUSTOM_MedievalMallet')).toBeInTheDocument()
    })
  })
})

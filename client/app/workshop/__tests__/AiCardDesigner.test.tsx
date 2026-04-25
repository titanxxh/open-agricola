// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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
  })

  it('shows the updated title and a prominent warning when no model is configured', () => {
    const html = renderDesigner()

    expect(html).toContain('配置AI模型')
    expect(html).toContain('尚未配置任何 AI 模型')
    expect(html).toContain('图片生成：未配置')
    expect(html).toContain('能力生成：未配置')
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
})

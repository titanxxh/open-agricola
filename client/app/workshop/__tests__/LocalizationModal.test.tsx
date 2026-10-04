// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { LocalizationModal } from '../LocalizationModal'
import { getLlmConfig, translateCardContent } from '../../../services/llm'

vi.mock('../../../services/llm', () => ({
  getLlmConfig: vi.fn(),
  translateCardContent: vi.fn(),
}))

const current = { name: 'Source', desc: ['Source description'] }
const completeLocales = {
  en: { ...current, rules: ['English ruling'], prerequisite: 'Old prerequisite' },
  zh: { name: '译名', desc: ['描述'], rules: ['中文补充规则'], prerequisite: '旧前置条件' },
}

describe('LocalizationModal supplemental rules', () => {
  beforeEach(() => vi.resetAllMocks())

  it('preserves both languages rules while saving edits and clearing prerequisites', async () => {
    const onSave = vi.fn()
    render(<LocaleProvider><LocalizationModal currentContent={current} currentLang="en"
      locales={completeLocales} onSave={onSave} onClose={vi.fn()} /></LocaleProvider>)
    await userEvent.clear(screen.getByLabelText('名称'))
    await userEvent.type(screen.getByLabelText('名称'), '新译名')
    await userEvent.clear(screen.getByLabelText('前置条件'))
    await userEvent.click(screen.getByRole('button', { name: '保存', exact: true }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      en: expect.objectContaining({ rules: ['English ruling'] }),
      zh: expect.objectContaining({ name: '新译名', rules: ['中文补充规则'] }),
    }))
    const saved = onSave.mock.calls[0]![0]
    expect(saved.en.prerequisite).toBeUndefined()
    expect(saved.zh.prerequisite).toBeUndefined()
  })

  it('preserves rules in incomplete locales during automatic translation', async () => {
    vi.mocked(getLlmConfig).mockReturnValue({ provider: 'gemini', apiKey: 'test', model: 'test' })
    vi.mocked(translateCardContent).mockResolvedValue({ name: '自动译名', desc: ['自动描述'] })
    const onSave = vi.fn()
    render(<LocaleProvider><LocalizationModal currentContent={current} currentLang="en"
      locales={{ ...completeLocales, zh: { name: '', desc: [], rules: ['已有规则'] } }}
      onSave={onSave} onClose={vi.fn()} /></LocaleProvider>)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      en: expect.objectContaining({ rules: ['English ruling'] }),
      zh: expect.objectContaining({ name: '自动译名', desc: ['自动描述'], rules: ['已有规则'] }),
    })))
  })
})

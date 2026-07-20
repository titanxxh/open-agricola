// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocaleProvider, useLocale } from '../LocaleContext'

function LocaleProbe() {
  const { locale, setLocale } = useLocale()
  return (
    <button type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>
      {locale}
    </button>
  )
}

describe('LocaleProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = ''
  })

  it('keeps the document language synchronized with the selected locale', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    )

    expect(document.documentElement.lang).toBe('en')
    await user.click(screen.getByRole('button', { name: 'en' }))
    expect(document.documentElement.lang).toBe('zh')
  })
})

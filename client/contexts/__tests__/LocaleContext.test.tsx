// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
    window.history.replaceState(null, '', '/')
    document.documentElement.lang = ''
    document.documentElement.style.removeProperty('--bg-monthly')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the language and background synchronized with the selected locale', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    )

    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.style.getPropertyValue('--bg-monthly')).toContain('/summer-3.webp')
    fireEvent.click(screen.getByRole('button', { name: 'en' }))
    expect(document.documentElement.lang).toBe('zh')
    expect(document.documentElement.style.getPropertyValue('--bg-monthly')).toContain('/12dashu.webp')
  })

  it('updates the solar-term background at UTC+8 midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T15:59:59Z'))
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    )

    expect(document.documentElement.style.getPropertyValue('--bg-monthly')).toContain('/12dashu.webp')
    act(() => vi.advanceTimersByTime(1000))
    expect(document.documentElement.style.getPropertyValue('--bg-monthly')).toContain('/13liqiu.webp')
  })
})

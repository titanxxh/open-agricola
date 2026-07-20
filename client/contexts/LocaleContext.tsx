import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Locale } from '../../shared/i18n'
import { t as translate } from '../../shared/i18n'

const LOCALE_STORAGE_KEY = 'open-agricola-locale-v2'

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* ignore */ }
  return 'zh'
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* ignore */ }
  }, [locale])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}

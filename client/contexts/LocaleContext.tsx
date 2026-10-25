import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../shared/i18n'
import { hasLanguagePack, t as translate } from '../../shared/i18n'
import { getLanguageManifest, loadLanguagePack } from '../services/language-pack'
import { applyWebsiteBackground, millisecondsUntilNextUtc8Midnight } from '../utils/seasonalBackground'

const LOCALE_STORAGE_KEY = 'open-agricola-locale-v2'

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && hasLanguagePack(saved)) return saved
  } catch { /* ignore */ }
  return getLanguageManifest()?.defaultLocale ?? 'zh'
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale)
  const [languageError, setLanguageError] = useState(false)
  const switchVersion = useRef(0)

  const setLocale = useCallback((l: Locale) => {
    const version = ++switchVersion.current
    setLanguageError(false)
    const commit = () => {
      if (switchVersion.current !== version) return
      setLocaleState(l)
      try { window.localStorage.setItem(LOCALE_STORAGE_KEY, l) } catch { /* ignore */ }
    }
    if (hasLanguagePack(l)) commit()
    else void loadLanguagePack(l).then(commit).catch(() => {
      if (switchVersion.current === version) setLanguageError(true)
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* ignore */ }

    let timeout: number | undefined
    const refreshBackground = () => {
      const now = new Date()
      applyWebsiteBackground(locale, now)
      if (locale === 'zh') {
        timeout = window.setTimeout(refreshBackground, millisecondsUntilNextUtc8Midnight(now))
      }
    }
    refreshBackground()

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [locale])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {languageError ? <div role="alert">{t('ui.languageLoadFailed')}</div> : null}
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}

export function useCurrentLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? 'zh'
}

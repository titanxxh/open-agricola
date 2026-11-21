import { useEffect, useState, type ReactNode } from 'react'
import { hasCardTextPack } from '../../shared/i18n'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { useLocale } from '../contexts/LocaleContext'
import { loadCardTextPack } from '../services/language-pack'
import { AppLoadFailure } from './AppLoadFailure'
import { getGameLoadProgress } from './game-load-progress'

/**
 * Screens that show cards render only once the Card Text Pack of the current locale is registered, so their
 * synchronous translations never fall back to card ids or English. Startup has already begun the download.
 */
export function CardTextBoundary({ children }: { children: ReactNode }) {
  const { locale, t } = useLocale()
  const [failure, setFailure] = useState<string | null>(null)
  const [, setRegistered] = useState(0)
  const ready = hasCardTextPack(locale)

  useEffect(() => {
    if (ready) return
    let cancelled = false
    setFailure(null)
    void loadCardTextPack(locale).then(() => {
      if (!cancelled) setRegistered(count => count + 1)
    }).catch((error: unknown) => {
      if (!cancelled) setFailure(error instanceof Error ? error.message : String(error))
    })
    return () => { cancelled = true }
  }, [locale, ready])

  if (ready) return <>{children}</>
  if (failure !== null) return <AppLoadFailure detail={`Failed to load card text: ${failure}`} />
  const { percent, labelKey } = getGameLoadProgress('manifest')
  return <GameLoadScreen percent={percent} label={t(labelKey)} />
}

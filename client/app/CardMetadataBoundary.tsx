import { useEffect, useState, type ReactNode } from 'react'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { useLocale } from '../contexts/LocaleContext'
import { loadCardsManifest } from '../services/card-meta'
import { AppLoadFailure } from './AppLoadFailure'
import { getGameLoadProgress } from './game-load-progress'

type Readiness = { status: 'loading' } | { status: 'ready' } | { status: 'error'; detail: string }

export function CardMetadataBoundary({ children }: { children: ReactNode }) {
  const { t } = useLocale()
  const [readiness, setReadiness] = useState<Readiness>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void loadCardsManifest().then(() => {
      if (!cancelled) setReadiness({ status: 'ready' })
    }).catch((error: unknown) => {
      if (!cancelled) setReadiness({ status: 'error', detail: error instanceof Error ? error.message : String(error) })
    })
    return () => { cancelled = true }
  }, [])

  if (readiness.status === 'error') {
    return <AppLoadFailure detail={`Failed to load card metadata: ${readiness.detail}`} />
  }
  if (readiness.status === 'loading') {
    const { percent, labelKey } = getGameLoadProgress('manifest')
    return <GameLoadScreen percent={percent} label={t(labelKey)} />
  }
  return <>{children}</>
}

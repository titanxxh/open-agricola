import { useLocale } from '../contexts/LocaleContext'
import { getPrereleaseRuntime, isPrereleaseClient, prereleaseStartUrl } from '../services/prerelease-runtime'
import './PrereleaseBoundary.css'

export function PrereleaseBanner() {
  const { t } = useLocale()
  if (!isPrereleaseClient()) return null
  const runtime = getPrereleaseRuntime()
  return <aside className="prerelease-banner" aria-label={t('prerelease.environment')}>
    <strong>{t('prerelease.version', { version: (runtime?.buildId ?? import.meta.env.VITE_GAME_BUILD_ID ?? '').slice(0, 12) })}</strong>
    {runtime ? <a href={`${runtime.formalAppOrigin}/`}>{t('prerelease.returnToProduction')}</a>
      : <a href={prereleaseStartUrl()}>{t('prerelease.entry')}</a>}
  </aside>
}

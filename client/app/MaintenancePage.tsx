import { useState } from 'react'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { SiteCommunityLinks } from '../components/common/SiteCommunityLinks'
import { BrandMark } from '../components/common/BrandMark'
import { retryServerNow } from '../services/server-availability'

/**
 * Shown instead of the lobby and login while the game server is unavailable (#1816). The availability store retries
 * every 15 s; when the server answers again the session is refreshed and the router returns to the requested page.
 */
export function MaintenancePage() {
  const { t } = useLocale()
  const [checking, setChecking] = useState(false)
  const retry = async () => {
    setChecking(true)
    try { await retryServerNow() } finally { setChecking(false) }
  }
  return (
    <div className="login-page">
      <div className="login-card server-maintenance" data-testid="server-maintenance">
        <div className="login-top-bar">
          <SiteCommunityLinks />
          <LocaleSwitcher />
        </div>
        <BrandMark
          title={t('platform.loginTitle')}
          titleAs="h1"
          className="login-brand"
          titleClassName="login-title"
          homeLinkLabel={t('platform.backToLobbyPlain')}
        />
        <h2 className="login-context-title">{t('platform.serverMaintenance.title')}</h2>
        <p role="status" className="server-maintenance__text">{t('platform.serverMaintenance.body')}</p>
        <p className="server-maintenance__text">{t('platform.serverMaintenance.retrying')}</p>
        <button type="button" className="btn-primary" disabled={checking} onClick={() => { void retry() }}>
          {t('platform.serverMaintenance.retryNow')}
        </button>
      </div>
    </div>
  )
}

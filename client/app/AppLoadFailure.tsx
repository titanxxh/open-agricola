import { BrandMark } from '../components/common/BrandMark'
import { SiteCommunityLinks } from '../components/common/SiteCommunityLinks'
import { useLocale } from '../contexts/LocaleContext'

export function AppLoadFailure({ detail }: { detail?: string }) {
  const { t } = useLocale()
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1'
  return (
    <div className="ws-status-screen">
      <div className="ws-status-card">
        {!embedded && <div className="site-header-links"><SiteCommunityLinks /></div>}
        {!embedded ? (
          <BrandMark
            title="Open Agricola"
            titleAs="h2"
            className="brand-mark-centered ws-status-brand"
            titleClassName="ws-status-title"
            homeLinkLabel={t('platform.backToLobbyPlain')}
          />
        ) : null}
        <div className="ws-status-text" role="alert">{t('platform.appLoadFailed')}</div>
        {detail ? <div className="ws-status-text">{detail}</div> : null}
        <div className="ws-error-actions">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            {t('platform.retry')}
          </button>
        </div>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'

/** Browse state lives outside the loader, so a retry comes back to the same search and page. */
export function EncyclopediaLoadError({ locale, onRetry, children }: { locale: Locale; onRetry: () => void; children?: ReactNode }) {
  return (
    <div className="encyclopedia-load-error" role="alert">
      <h2>{t(locale, 'ui.encyclopedia.loadError.title')}</h2>
      <p>{t(locale, 'ui.encyclopedia.loadError.body')}</p>
      <div className="encyclopedia-load-error__actions">
        <button type="button" className="btn-primary" onClick={onRetry}>{t(locale, 'platform.retry')}</button>
        {children}
      </div>
    </div>
  )
}

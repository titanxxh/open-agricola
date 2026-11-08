import { t, type Locale } from '../../../shared/i18n'
import './beta-badge.css'

export function BetaBadge({ locale }: { locale: Locale }) {
  return <small className="beta-badge">{t(locale, 'beta.badge')}</small>
}

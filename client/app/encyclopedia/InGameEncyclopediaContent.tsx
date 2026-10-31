import { t, type Locale } from '../../../shared/i18n'
import { EncyclopediaBrowser } from './EncyclopediaBrowser'
import { EncyclopediaLoadError } from './EncyclopediaLoadError'
import { useMemoryEncyclopediaNavigation } from './encyclopedia-navigation'
import { useCardEncyclopedia } from './useCardEncyclopedia'

export function InGameEncyclopediaContent({ locale, onBackToGame }: { locale: Locale; onBackToGame: () => void }) {
  const load = useCardEncyclopedia()
  const navigation = useMemoryEncyclopediaNavigation()
  if (load.status === 'ready') {
    return <EncyclopediaBrowser encyclopedia={load.encyclopedia} navigation={navigation} locale={locale} />
  }
  if (load.status === 'error') {
    return (
      <EncyclopediaLoadError locale={locale} onRetry={load.retry}>
        <button type="button" className="btn-secondary" onClick={onBackToGame}>{t(locale, 'ui.encyclopedia.inGame.backToGame')}</button>
      </EncyclopediaLoadError>
    )
  }
  return <p className="encyclopedia-page__loading" role="status">{t(locale, 'platform.loading')}</p>
}

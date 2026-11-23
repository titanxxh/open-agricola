import { EncyclopediaBrowser } from '../app/encyclopedia/EncyclopediaBrowser'
import { EncyclopediaLoadError } from '../app/encyclopedia/EncyclopediaLoadError'
import { encyclopediaBrowseStore } from '../app/encyclopedia/encyclopedia-browse-store'
import { useEncyclopediaUrlNavigation } from '../app/encyclopedia/encyclopedia-navigation'
import { useCardEncyclopedia } from '../app/encyclopedia/useCardEncyclopedia'
import { BrandMark } from '../components/common/BrandMark'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { useLocale } from '../contexts/LocaleContext'

const lobbyHref = new URL('../', new URL(import.meta.env.BASE_URL, location.origin)).href

function resetBrowse() {
  encyclopediaBrowseStore.reset()
  window.scrollTo(0, 0)
}

export function StaticEncyclopedia() {
  const { locale, t } = useLocale()
  const load = useCardEncyclopedia()
  const navigation = useEncyclopediaUrlNavigation({ onCloseLanding: resetBrowse })

  return (
    <div className="encyclopedia-page">
      <header className="encyclopedia-page__header">
        <a className="brand-mark-home site-home-brand" href={lobbyHref} aria-label={t('platform.backToLobbyPlain')}>
          <BrandMark title="Open Agricola" titleClassName="site-home-brand__title" />
        </a>
        <LocaleSwitcher />
      </header>
      <main className="encyclopedia-page__main">
        <h1 className="encyclopedia-page__title">{t('ui.encyclopedia.title')}</h1>
        <p className="encyclopedia-page__description">{t('ui.encyclopedia.description')}</p>
        {load.status === 'ready'
          ? <EncyclopediaBrowser encyclopedia={load.encyclopedia} navigation={navigation} locale={locale} />
          : load.status === 'error'
            ? <EncyclopediaLoadError locale={locale} onRetry={load.retry} />
            : <p className="encyclopedia-page__loading" role="status">{t('platform.loading')}</p>}
      </main>
    </div>
  )
}

import { useLayoutEffect } from 'react'
import { BrandMark } from '../../components/common/BrandMark'
import { LocaleSwitcher } from '../../components/common/LocaleSwitcher'
import { useLocale } from '../../contexts/LocaleContext'
import { EncyclopediaBrowser } from './EncyclopediaBrowser'
import { encyclopediaBrowseStore } from './encyclopedia-browse-store'
import { useEncyclopediaUrlNavigation } from './encyclopedia-navigation'
import { useCardEncyclopedia } from './useCardEncyclopedia'

export function EncyclopediaPage() {
  const { locale, t } = useLocale()
  const load = useCardEncyclopedia()
  const navigation = useEncyclopediaUrlNavigation()
  const ready = load.status === 'ready'

  useLayoutEffect(() => {
    if (!ready) return
    window.scrollTo(0, encyclopediaBrowseStore.getScrollTop())
    return () => encyclopediaBrowseStore.setScrollTop(window.scrollY)
  }, [ready])

  return (
    <div className="encyclopedia-page">
      <header className="encyclopedia-page__header">
        <BrandMark
          title="Open Agricola"
          className="site-home-brand"
          titleClassName="site-home-brand__title"
          homeLinkLabel={t('platform.backToLobbyPlain')}
        />
        <LocaleSwitcher />
      </header>
      <main className="encyclopedia-page__main">
        <h1 className="encyclopedia-page__title">{t('ui.encyclopedia.title')}</h1>
        <p className="encyclopedia-page__description">{t('ui.encyclopedia.description')}</p>
        {load.status === 'ready'
          ? <EncyclopediaBrowser encyclopedia={load.encyclopedia} navigation={navigation} locale={locale} />
          : load.status === 'error'
            ? (
              <div className="encyclopedia-load-error" role="alert">
                <h2>{t('ui.encyclopedia.loadError.title')}</h2>
                <p>{t('ui.encyclopedia.loadError.body')}</p>
                <button type="button" className="btn-primary" onClick={load.retry}>{t('platform.retry')}</button>
              </div>
            )
            : <p className="encyclopedia-page__loading" role="status">{t('platform.loading')}</p>}
      </main>
    </div>
  )
}

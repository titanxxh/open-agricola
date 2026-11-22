import { useLayoutEffect } from 'react'
import { BrandMark } from '../../components/common/BrandMark'
import { LocaleSwitcher } from '../../components/common/LocaleSwitcher'
import { useLocale } from '../../contexts/LocaleContext'
import { EncyclopediaBrowser } from './EncyclopediaBrowser'
import { EncyclopediaLoadError } from './EncyclopediaLoadError'
import { encyclopediaBrowseStore } from './encyclopedia-browse-store'
import { useEncyclopediaUrlNavigation } from './encyclopedia-navigation'
import { useCardEncyclopedia } from './useCardEncyclopedia'

const startOverFromLanding = () => {
  encyclopediaBrowseStore.reset()
  window.scrollTo(0, 0)
}

export function EncyclopediaPage() {
  const { locale, t } = useLocale()
  const load = useCardEncyclopedia()
  const navigation = useEncyclopediaUrlNavigation({ onCloseLanding: startOverFromLanding })
  const ready = load.status === 'ready'

  useLayoutEffect(() => {
    if (!ready) return
    window.scrollTo(0, encyclopediaBrowseStore.getScrollTop())
    const saveScroll = () => encyclopediaBrowseStore.setScrollTop(window.scrollY)
    // A full navigation away does not unmount the page.
    window.addEventListener('pagehide', saveScroll)
    return () => {
      window.removeEventListener('pagehide', saveScroll)
      saveScroll()
    }
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
            ? <EncyclopediaLoadError locale={locale} onRetry={load.retry} />
            : <p className="encyclopedia-page__loading" role="status">{t('platform.loading')}</p>}
      </main>
    </div>
  )
}

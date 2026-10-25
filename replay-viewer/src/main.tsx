import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../client/styles/tokens.css'
import '../../client/styles/base.css'
import '../../client/styles/components.css'
import '../../client/styles/pages/game.css'
import '../../client/styles/card-sprite.css'
import { loadCardsManifest } from '../../client/services/card-meta'
import { ReplayViewer } from './ReplayViewer'
import './styles.css'
import { loadLanguageManifest, loadLanguagePack } from '../../client/services/language-pack'

const root = createRoot(document.getElementById('root')!)

void loadLanguageManifest().then(async manifest => {
  const requested = new URLSearchParams(location.search).get('locale')
  const locale = manifest.languages.find(language => language.id === requested)?.id ?? manifest.defaultLocale
  await loadLanguagePack(locale)
  return locale
}).then(async locale => {
  await loadCardsManifest()
  root.render(
    <StrictMode>
      <ReplayViewer locale={locale} />
    </StrictMode>,
  )
})
  .catch(() => root.render(
    <main className="replay-loading replay-error">Card metadata is unavailable.</main>,
  ))

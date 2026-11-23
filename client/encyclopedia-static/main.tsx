import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startApplication } from '../app/application-bootstrap'
import { forgetEncyclopediaBrowseOnReload } from '../app/encyclopedia/encyclopedia-session-reset'
import { LocaleProvider } from '../contexts/LocaleContext'
import { loadCardsManifest } from '../services/card-meta'
import { loadFullLanguage, loadLanguageManifest } from '../services/language-pack'
import { StaticEncyclopedia } from './StaticEncyclopedia'
import '../index.css'
import '../App.css'

async function loadInitialLanguage() {
  const manifest = await loadLanguageManifest()
  let saved: string | null = null
  try { saved = localStorage.getItem('open-agricola-locale-v2') } catch { /* storage may be disabled */ }
  const locale = manifest.languages.find(language => language.id === saved)?.id ?? manifest.defaultLocale
  await loadFullLanguage(locale)
}

const container = document.getElementById('root')
if (!container) throw new Error('Encyclopedia root is missing')

void startApplication(container, async () => {
  forgetEncyclopediaBrowseOnReload()
  await Promise.all([loadInitialLanguage(), loadCardsManifest()])
  createRoot(container).render(<StrictMode><LocaleProvider><StaticEncyclopedia /></LocaleProvider></StrictMode>)
}).catch(() => {
  document.getElementById('loading')?.setAttribute('hidden', '')
  document.getElementById('load-error')?.removeAttribute('hidden')
})

import { hasLanguagePack, parseLanguageManifest, registerLanguagePack, type LanguageManifest, type Locale } from '../../shared/i18n'
import { fetchVerifiedResource } from './fetch-verified-resource'

let manifest: Promise<LanguageManifest> | undefined
let loadedManifest: LanguageManifest | undefined
export const getLanguageManifest = () => loadedManifest
const pending = new Map<Locale, Promise<void>>()
const base = `${import.meta.env.BASE_URL}i18n/`

export function loadLanguageManifest(): Promise<LanguageManifest> {
  manifest ??= fetch(`${base}manifest.json`, { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error(`Language list unavailable (${response.status})`)
    loadedManifest = parseLanguageManifest(await response.json())
    return loadedManifest
  }).catch(error => { manifest = undefined; throw error })
  return manifest
}

export async function loadLanguagePack(locale: Locale): Promise<void> {
  if (hasLanguagePack(locale)) return
  const existing = pending.get(locale)
  if (existing) return existing
  const request = (async () => {
    const list = await loadLanguageManifest()
    const language = list.languages.find(item => item.id === locale)
    if (!language) throw new Error(`Unknown language: ${locale}`)
    const response = await fetchVerifiedResource(`${base}${language.file}`, language.sha256)
    if (!response.ok) throw new Error(`Language unavailable (${response.status})`)
    const raw = await response.text()
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('locale' in value) || value.locale !== locale) throw new Error('Language identity mismatch')
    registerLanguagePack(value)
  })()
  pending.set(locale, request)
  try { await request } finally { pending.delete(locale) }
}

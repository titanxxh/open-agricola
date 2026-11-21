import { hasCardTextPack, hasLanguagePack, parseLanguageManifest, registerLanguagePack, type LanguageManifest, type LanguagePart, type Locale } from '../../shared/i18n'
import { fetchVerifiedResource } from './fetch-verified-resource'

let manifest: Promise<LanguageManifest> | undefined
let loadedManifest: LanguageManifest | undefined
export const getLanguageManifest = () => loadedManifest
const pending = new Map<string, Promise<void>>()
const base = `${import.meta.env.BASE_URL}i18n/`

export function loadLanguageManifest(): Promise<LanguageManifest> {
  const built: string | undefined = import.meta.env.VITE_LANGUAGE_MANIFEST
  if (built && !manifest) {
    loadedManifest = parseLanguageManifest(JSON.parse(built))
    manifest = Promise.resolve(loadedManifest)
  }
  manifest ??= fetch(`${base}manifest.json`, { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error(`Language list unavailable (${response.status})`)
    loadedManifest = parseLanguageManifest(await response.json())
    return loadedManifest
  }).catch(error => { manifest = undefined; throw error })
  return manifest
}

async function loadPart(locale: Locale, part: LanguagePart): Promise<void> {
  if (part === 'core' ? hasLanguagePack(locale) : hasCardTextPack(locale)) return
  const key = `${part}:${locale}`
  const existing = pending.get(key)
  if (existing) return existing
  const request = (async () => {
    const list = await loadLanguageManifest()
    const language = list.languages.find(item => item.id === locale)
    if (!language) throw new Error(`Unknown language: ${locale}`)
    const { file, sha256 } = language[part]
    const response = await fetchVerifiedResource(`${base}${file}`, sha256)
    if (!response.ok) throw new Error(`Language unavailable (${response.status})`)
    const raw = await response.text()
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('locale' in value) || value.locale !== locale) throw new Error('Language identity mismatch')
    registerLanguagePack(value, part)
  })()
  pending.set(key, request)
  try { await request } finally { pending.delete(key) }
}

/** The Core Language Pack: everything startup and card-free screens translate. */
export const loadLanguagePack = (locale: Locale): Promise<void> => loadPart(locale, 'core')

/** The Card Text Pack: card faces and names, awaited only by screens that show cards. */
export const loadCardTextPack = (locale: Locale): Promise<void> => loadPart(locale, 'cards')

export const hasFullLanguage = (locale: Locale): boolean => hasLanguagePack(locale) && hasCardTextPack(locale)

export async function loadFullLanguage(locale: Locale): Promise<void> {
  await Promise.all([loadLanguagePack(locale), loadCardTextPack(locale)])
}

import { classicCardDeck } from '../projections/card-display-number'
import { normalizeClassicCardTextIcons } from '../projections/card-text-icons'

export type Locale = string
export type TranslationParams = Readonly<Record<string, string | number>>
export type LanguagePack = Readonly<{
  version: 1
  locale: Locale
  messages: Readonly<Record<string, string>>
}>
/**
 * A language ships as a Core Language Pack, which startup waits for, and a Card Text Pack, which only screens that
 * show cards wait for. Together they hold every message of that language.
 */
export type LanguagePart = 'core' | 'cards'
export type LanguagePackFile = Readonly<{ file: string; sha256: string }>
export type Language = Readonly<{ id: Locale; name: string; core: LanguagePackFile; cards: LanguagePackFile; sourceSha256: string }>
export type LanguageManifest = Readonly<{ version: 2; defaultLocale: Locale; languages: readonly Language[] }>

const parts = new Map<Locale, Partial<Record<LanguagePart, LanguagePack>>>()
const packs = new Map<Locale, LanguagePack>()

const sha256Pattern = /^[a-f0-9]{64}$/
function packFile(value: unknown, stem: string): LanguagePackFile {
  if (!value || typeof value !== 'object' || !('sha256' in value) || typeof value.sha256 !== 'string' || !sha256Pattern.test(value.sha256)
    || !('file' in value) || value.file !== `${stem}.${value.sha256.slice(0, 16)}.json`) throw new Error('Invalid language entry')
  return Object.freeze({ file: value.file, sha256: value.sha256 })
}

export function parseLanguageManifest(value: unknown): LanguageManifest {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 2
    || !('defaultLocale' in value) || typeof value.defaultLocale !== 'string'
    || !('languages' in value) || !Array.isArray(value.languages)) throw new Error('Invalid language list')
  const identities = new Set<string>()
  const languages = value.languages.map((item: unknown): Language => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string'
      || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(item.id) || identities.has(item.id)
      || !('name' in item) || typeof item.name !== 'string' || !item.name.trim()
      || !('sourceSha256' in item) || typeof item.sourceSha256 !== 'string' || !sha256Pattern.test(item.sourceSha256)
      || !('core' in item) || !('cards' in item)) throw new Error('Invalid language entry')
    identities.add(item.id)
    return Object.freeze({
      id: item.id, name: item.name, core: packFile(item.core, item.id), cards: packFile(item.cards, `${item.id}-cards`),
      sourceSha256: item.sourceSha256,
    })
  })
  if (!identities.has(value.defaultLocale)) throw new Error('Missing default language')
  return Object.freeze({ version: 2, defaultLocale: value.defaultLocale, languages: Object.freeze(languages) })
}

export function parseLanguagePack(value: unknown): LanguagePack {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('locale' in value) || typeof value.locale !== 'string'
    || !('messages' in value) || !value.messages || typeof value.messages !== 'object'
    || Array.isArray(value.messages)) throw new Error('Invalid language pack')
  const messages: Record<string, string> = Object.create(null)
  for (const [key, text] of Object.entries(value.messages)) {
    if (typeof text !== 'string') throw new Error(`Invalid translation: ${key}`)
    messages[key] = text
  }
  return Object.freeze({ version: 1, locale: value.locale, messages: Object.freeze(messages) })
}

/** Joins the two files of one language, for build tools and the server that read them directly. */
export function combineLanguageParts(core: unknown, cards: unknown): LanguagePack {
  const first = parseLanguagePack(core)
  const second = parseLanguagePack(cards)
  if (first.locale !== second.locale) throw new Error('Language identity mismatch')
  const messages: Record<string, string> = Object.assign(Object.create(null), first.messages, second.messages)
  return Object.freeze({ version: 1, locale: first.locale, messages: Object.freeze(messages) })
}

/** Registers one part of a language; translations read the union of the parts registered so far. */
export function registerLanguagePack(value: unknown, part: LanguagePart = 'core'): LanguagePack {
  const pack = parseLanguagePack(value)
  const registered = { ...parts.get(pack.locale), [part]: pack }
  parts.set(pack.locale, registered)
  const messages: Record<string, string> = Object.assign(Object.create(null), registered.core?.messages, registered.cards?.messages)
  packs.set(pack.locale, Object.freeze({ version: 1, locale: pack.locale, messages: Object.freeze(messages) }))
  return pack
}

export const getLoadedLocales = (): Locale[] => [...packs.keys()]
export const getLanguagePack = (locale: Locale): LanguagePack | undefined => packs.get(locale)

export const hasLanguagePack = (locale: Locale): boolean => parts.get(locale)?.core !== undefined
export const hasCardTextPack = (locale: Locale): boolean => parts.get(locale)?.cards !== undefined

export const t = (locale: Locale, key: string, params: TranslationParams = {}): string =>
  formatMessage(packs.get(locale)?.messages, key, params)

export const formatMessage = (
  messages: Readonly<Record<string, string>> | undefined,
  key: string,
  params: TranslationParams = {},
): string => {
  const template = messages?.[key] ?? key
  return template.replace(/\{([^{}]+)\}/g, (token, name: string) => {
    if (Object.hasOwn(params, name)) return String(params[name])
    if (name.startsWith('card:')) return messages?.[`cardFaces.${name.slice(5)}.name`] ?? token
    return token
  })
}

export type CardTextSource = {
  authored?: true
  name?: string; desc?: readonly string[]; rules?: readonly string[]; prerequisite?: unknown
  locales?: Record<string, { name?: string; desc?: readonly string[]; rules?: readonly string[]; prerequisite?: string }>
}

/** Authored draft/replay content stays scoped to the supplied card, never the global packs. */
export function cardText(locale: Locale, id: string, source?: CardTextSource) {
  const messages = packs.get(locale)?.messages
  const translated = source?.locales?.[locale]
  const lines = (value: readonly string[] | undefined) => value?.join('\n').trim() ? value.join('\n') : undefined
  const custom = source?.authored === true || !messages?.[`cardFaces.${id}.name`]
  const classic = classicCardDeck(id) !== undefined
  const field = (name: string, authored?: string, english = '') => {
    const localized = custom ? authored : messages?.[`cardFaces.${id}.${name}`]
    const text = (custom || classic) && !localized?.trim() ? english : localized ?? ''
    return classic ? normalizeClassicCardTextIcons(text) : text
  }
  return {
    name: field('name', translated?.name, source?.name ?? id),
    description: field('description', lines(translated?.desc), source?.desc?.join('\n')),
    rules: field('rules', lines(translated?.rules), source?.rules?.join('\n')),
    prerequisite: field('prerequisite', translated?.prerequisite,
      typeof source?.prerequisite === 'string' ? source.prerequisite : '') || undefined,
  }
}

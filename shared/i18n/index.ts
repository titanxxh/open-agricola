export type Locale = string
export type TranslationParams = Readonly<Record<string, string | number>>
export type LanguagePack = Readonly<{
  version: 1
  locale: Locale
  messages: Readonly<Record<string, string>>
}>
export type Language = Readonly<{ id: Locale; name: string; file: string; sha256: string; sourceSha256: string }>
export type LanguageManifest = Readonly<{ version: 1; defaultLocale: Locale; languages: readonly Language[] }>

const packs = new Map<Locale, LanguagePack>()

export function parseLanguageManifest(value: unknown): LanguageManifest {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('defaultLocale' in value) || typeof value.defaultLocale !== 'string'
    || !('languages' in value) || !Array.isArray(value.languages)) throw new Error('Invalid language list')
  const identities = new Set<string>()
  const languages = value.languages.map((item: unknown): Language => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string'
      || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(item.id) || identities.has(item.id)
      || !('name' in item) || typeof item.name !== 'string' || !item.name.trim()
      || !('sha256' in item) || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !('sourceSha256' in item) || typeof item.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sourceSha256)
      || !('file' in item) || item.file !== `${item.id}.${item.sha256.slice(0, 16)}.json`) throw new Error('Invalid language entry')
    identities.add(item.id)
    return Object.freeze({ id: item.id, name: item.name, file: item.file, sha256: item.sha256, sourceSha256: item.sourceSha256 })
  })
  if (!identities.has(value.defaultLocale)) throw new Error('Missing default language')
  return Object.freeze({ version: 1, defaultLocale: value.defaultLocale, languages: Object.freeze(languages) })
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

export function registerLanguagePack(value: unknown): LanguagePack {
  const pack = parseLanguagePack(value)
  packs.set(pack.locale, pack)
  return pack
}

export const getLoadedLocales = (): Locale[] => [...packs.keys()]
export const getLanguagePack = (locale: Locale): LanguagePack | undefined => packs.get(locale)

export const hasLanguagePack = (locale: Locale): boolean => packs.has(locale)

export const t = (locale: Locale, key: string, params: TranslationParams = {}): string => {
  const messages = packs.get(locale)?.messages
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
  const field = (name: string, authored?: string, english = '') => custom
    ? authored?.trim() ? authored : english
    : messages?.[`cardFaces.${id}.${name}`] ?? ''
  return {
    name: field('name', translated?.name, source?.name ?? id),
    description: field('description', lines(translated?.desc), source?.desc?.join('\n')),
    rules: field('rules', lines(translated?.rules), source?.rules?.join('\n')),
    prerequisite: field('prerequisite', translated?.prerequisite,
      typeof source?.prerequisite === 'string' ? source.prerequisite : '') || undefined,
  }
}

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  EncyclopediaEntry,
  EncyclopediaSearchDocument,
  EncyclopediaSearchText,
  EncyclopediaText,
  EncyclopediaTextField,
  EncyclopediaTextStatus,
} from '../../shared/contract/card-encyclopedia'
import { formatMessage, parseLanguageManifest, parseLanguagePack } from '../../shared/i18n'
import { resolveEncyclopediaText } from '../../shared/projections/card-encyclopedia-text'
import { cardTextIconNameKeys, cardTextIconTokens, searchableCardText } from '../../shared/projections/card-text-icons'
import { flattenDictionary } from '../i18n/flatten-dictionary'

export type EncyclopediaLanguage = {
  readonly id: string
  readonly messages: Readonly<Record<string, string>>
  /** Keys the language translates itself; everything else in its pack is the English fallback. */
  readonly ownKeys: ReadonlySet<string>
}

const BASE_LANGUAGE = 'en'
const TEXT_FIELDS: readonly EncyclopediaTextField[] = ['name', 'body', 'rules', 'prerequisite']
const CARD_FACE_KEY = /^cardFaces\.([^.]+)\.(name|description|rules|prerequisite)$/

/** Pinned packs plus their source dictionaries, as prepared by `prepare-language-packs`. */
export const loadEncyclopediaLanguages = (root = resolve('.')): EncyclopediaLanguage[] => {
  const manifest = parseLanguageManifest(JSON.parse(readFileSync(resolve(root, 'public/i18n/manifest.json'), 'utf8')))
  return manifest.languages.map((language) => {
    const pack = parseLanguagePack(JSON.parse(readFileSync(resolve(root, 'public/i18n', language.file), 'utf8')))
    const source: unknown = JSON.parse(readFileSync(resolve(root, 'output/i18n/locales', `${language.id}.json`), 'utf8'))
    return { id: language.id, messages: pack.messages, ownKeys: new Set(flattenDictionary(source).keys()) }
  })
}

const translate = (language: EncyclopediaLanguage, key: string, params?: Readonly<Record<string, string | number>>) =>
  Object.hasOwn(language.messages, key) ? formatMessage(language.messages, key, params) : ''

/** Card faces compile from `<section>.<id>.<field>` (or `cards.<id>.name`) in the language's own source. */
const sourceKeys = (entry: EncyclopediaEntry, key: string): string[] => {
  const match = CARD_FACE_KEY.exec(key)
  if (!match) return [key]
  const [, id, field] = match
  const section = entry.publicType === 'occupation' ? 'occupations' : entry.publicType === 'major' ? 'improvements' : 'minorImprovements'
  return [`${section}.${id}.${field}`, ...(field === 'name' ? [`cards.${id}.name`] : [])]
}

const fieldStatus = (
  entry: EncyclopediaEntry,
  parts: EncyclopediaText,
  language: EncyclopediaLanguage,
  english: EncyclopediaLanguage | undefined,
  text: string,
): EncyclopediaTextStatus => {
  if (!text.trim()) return 'missing'
  if (language.id === BASE_LANGUAGE || !english) return 'localized'
  const fallsBack = parts.some((part) => 'key' in part
    && translate(english, part.key, part.params).trim() !== ''
    && !sourceKeys(entry, part.key).some((key) => language.ownKeys.has(key)))
  return fallsBack ? 'fallback' : 'localized'
}

const iconWords = (language: EncyclopediaLanguage, token: string) =>
  (cardTextIconNameKeys(token) ?? []).map((key) => translate(language, key)).filter(Boolean)

const searchDocument = (entry: EncyclopediaEntry, languages: readonly EncyclopediaLanguage[]): EncyclopediaSearchDocument => {
  const english = languages.find((language) => language.id === BASE_LANGUAGE)
  const rawTexts: string[] = []
  const locales = Object.fromEntries(languages.map((language) => {
    const fields: Partial<Record<EncyclopediaTextField, EncyclopediaSearchText>> = {}
    for (const field of TEXT_FIELDS) {
      const parts = entry.text[field]
      if (!parts) continue
      const raw = resolveEncyclopediaText(parts, (key, params) => translate(language, key, params))
      rawTexts.push(raw)
      fields[field] = {
        text: searchableCardText(raw, (token) => iconWords(language, token).join(' ')),
        status: fieldStatus(entry, parts, language, english, raw),
      }
    }
    return [language.id, fields]
  }))
  const tokens = [...new Set(rawTexts.flatMap(cardTextIconTokens))]
  const iconTerms = [...new Set(tokens.flatMap((token) => languages.flatMap((language) => iconWords(language, token))))]
  const identifiers = [...new Set([entry.sourceId, ...(entry.displayNumber ? [entry.displayNumber] : [])])]
  return { key: entry.key, identifiers, locales, iconTerms }
}

export const buildSearchDocuments = (
  entries: readonly EncyclopediaEntry[],
  languages: readonly EncyclopediaLanguage[],
): EncyclopediaSearchDocument[] => entries.map((entry) => searchDocument(entry, languages))

import type { EncyclopediaEntry, EncyclopediaTextField } from '../../../../shared/contract/card-encyclopedia'
import type { EncyclopediaItem } from '../encyclopedia-item'

export type SearchTexts = Partial<Record<EncyclopediaTextField, string>>

const fields = (texts: SearchTexts) =>
  Object.fromEntries(Object.entries(texts).map(([field, text]) => [field, { text, status: 'localized' as const }]))

/** Search documents shaped like the generated ones: plain text per language, icons already named. */
export const searchable = (entry: EncyclopediaEntry, en: SearchTexts, zh: SearchTexts, extraTerms: string[] = []): EncyclopediaItem => ({
  entry,
  document: {
    key: entry.key,
    identifiers: [entry.sourceId, ...(entry.displayNumber ? [entry.displayNumber] : [])],
    locales: { en: fields(en), zh: fields(zh) },
    extraTerms,
  },
})

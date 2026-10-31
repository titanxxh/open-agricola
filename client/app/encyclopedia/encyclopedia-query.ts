import type { EncyclopediaSearchDocument } from '../../../shared/contract/card-encyclopedia'
import type { EncyclopediaItem } from './encyclopedia-item'

/** Full-width forms become ASCII, accents drop and letters lowercase, so `Ａ００４` finds A004 and `crudite` finds Crudité. */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** Search text spaces out icon names (`数量的 木材 。`); a Chinese phrase typed without spaces should still match it. */
const HAN_SPACING = /\s+(?=\p{Script=Han})|(?<=\p{Script=Han})\s+/gu

const foldText = (text: string) => fold(text).replace(/\s+/g, ' ').trim().replace(HAN_SPACING, '')

/** Separators such as `·` or `/` carry no letter or digit and never narrow the results. */
const isSearchWord = (term: string) => /[\p{L}\p{N}]/u.test(term)

/** Best field first: exact number or id, complete name, part of a name, then card text, rules and icon words. */
const EXACT_ID = 0
const COMPLETE_NAME = 1
const NAME_PART = 2
const TEXT = 3
const RANK_COUNT = 4

type SearchIndex = Readonly<{ identifiers: readonly string[]; names: readonly string[]; texts: readonly string[] }>

const indexes = new WeakMap<EncyclopediaSearchDocument, SearchIndex>()

const searchIndex = (document: EncyclopediaSearchDocument): SearchIndex => {
  let index = indexes.get(document)
  if (!index) {
    const fields = Object.values(document.locales)
    index = {
      identifiers: document.identifiers.map(foldText),
      names: fields.flatMap(field => (field.name ? [foldText(field.name.text)] : [])),
      texts: [
        ...document.identifiers,
        ...fields.flatMap(field => [field.body, field.rules, field.prerequisite].flatMap(text => (text ? [text.text] : []))),
        ...document.extraTerms,
      ].map(foldText),
    }
    indexes.set(document, index)
  }
  return index
}

const wordRank = ({ identifiers, names, texts }: SearchIndex, word: string): number | undefined => {
  if (identifiers.includes(word)) return EXACT_ID
  if (names.includes(word)) return COMPLETE_NAME
  if (names.some(name => name.includes(word))) return NAME_PART
  if (texts.some(text => text.includes(word))) return TEXT
  return undefined
}

/** Every word must match somewhere in the entry; the whole query can still be a complete multi-word name. */
const entryRank = (index: SearchIndex, words: readonly string[], phrase: string): number | undefined => {
  let best = index.names.includes(phrase) ? COMPLETE_NAME : TEXT
  for (const word of words) {
    const rank = wordRank(index, word)
    if (rank === undefined) return undefined
    best = Math.min(best, rank)
  }
  return best
}

/** Returns matches in result order; the default catalog order is kept within equal ranks. */
export const queryEncyclopedia = (
  items: readonly EncyclopediaItem[],
  query: string,
): readonly EncyclopediaItem[] => {
  const words = fold(query).split(/\s+/).filter(isSearchWord)
  if (words.length === 0) return items
  const phrase = foldText(words.join(' '))
  const ranked: EncyclopediaItem[][] = Array.from({ length: RANK_COUNT }, () => [])
  for (const item of items) {
    const rank = entryRank(searchIndex(item.document), words, phrase)
    if (rank !== undefined) ranked[rank].push(item)
  }
  return ranked.flat()
}

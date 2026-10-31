import type { EncyclopediaEntry, EncyclopediaSearchDocument, EncyclopediaTextStatus } from '../../../../shared/contract/card-encyclopedia'
import type { CardEncyclopedia } from '../../../services/card-encyclopedia'
import type { EncyclopediaItem } from '../encyclopedia-item'

/** Keys follow the catalog's `${sourceKind}:${sourceId}` identity. */
const keyed = (entry: Omit<EncyclopediaEntry, 'key'>): EncyclopediaEntry => ({ key: `${entry.sourceKind}:${entry.sourceId}`, ...entry })

export const cardEntry = (cardId: string, displayNumber: string, overrides: Partial<EncyclopediaEntry> = {}): EncyclopediaEntry => ({
  key: `card:${cardId}`,
  sourceKind: 'card',
  sourceId: cardId,
  group: displayNumber.slice(0, 1) as EncyclopediaEntry['group'],
  publicType: 'minor',
  displayNumber,
  players: null,
  face: { kind: 'card', cardId, cardType: 'minor' },
  text: { name: [{ key: `cardFaces.${cardId}.name` }], body: [{ key: `cardFaces.${cardId}.description` }] },
  cost: { kind: 'printed', paths: [{ food: 1 }] },
  score: { fixed: null, extraVp: false },
  ...overrides,
})

export const BASEBOARDS = cardEntry('A004_Baseboards', 'A004', { cost: { kind: 'printed', paths: [{ food: 2 }, { grain: 1 }] } })

export const COOKING_HEARTH = keyed({
  sourceKind: 'major',
  sourceId: 'Major_CookingHearth1',
  group: 'majorStandard',
  publicType: 'major',
  displayNumber: null,
  players: null,
  face: { kind: 'card', cardId: 'Major_CookingHearth1', cardType: 'major' },
  text: { name: [{ key: 'cardFaces.Major_CookingHearth1.name' }], body: [{ key: 'cardFaces.Major_CookingHearth1.description' }] },
  cost: { kind: 'printed', paths: [{ clay: 4 }], returnCards: ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Fireplace3'] },
  score: { fixed: 1, extraVp: false },
})

export const parentEntry = (parentId: string, kind: 'mother' | 'father', fixed: number | null): EncyclopediaEntry => ({
  key: `parent:${parentId}`,
  sourceKind: 'parent',
  sourceId: parentId,
  group: 'parents',
  publicType: kind,
  displayNumber: parentId,
  players: null,
  face: { kind: 'parent', parentId },
  text: { name: [{ key: `ui.parentCard.${kind}` }, { literal: ` ${parentId}` }], body: [{ key: `parentFaces.${parentId}.text` }] },
  cost: { kind: 'notApplicable' },
  score: { fixed, extraVp: false },
})

export const WINTER = keyed({
  sourceKind: 'season',
  sourceId: 'winter',
  group: 'seasons',
  publicType: 'season',
  displayNumber: null,
  players: null,
  face: { kind: 'season', season: 'winter', actionId: 'season-winter-romantic-evening' },
  text: {
    name: [{ key: 'ui.seasons.winter' }],
    body: [
      { key: 'actions.season-winter-romantic-evening.name' },
      { literal: ' · ' },
      { key: 'actions.season-winter-romantic-evening.description' },
    ],
  },
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
})

export const MARKET_WORK = keyed({
  sourceKind: 'moorSpecialAction',
  sourceId: 'moor-special-1-5-6-market-work',
  group: 'moor',
  publicType: 'moorSpecialAction',
  displayNumber: null,
  players: { counts: [1, 5, 6] },
  face: {
    kind: 'moorSpecialAction',
    image: '/assets/moor/special-action-card/moor-special-1-5-6-market-work.webp',
    actions: ['black-market', 'illicit-work'],
  },
  text: {
    name: [{ key: 'moor.specialActions.black-market' }, { key: 'ui.listSeparator' }, { key: 'moor.specialActions.illicit-work' }],
    body: [{ key: 'moor.specialActions.black-market' }],
  },
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
})

type FieldStatuses = Partial<Record<'name' | 'body' | 'rules' | 'prerequisite', EncyclopediaTextStatus>>

export const documentFor = (entry: EncyclopediaEntry, zh: FieldStatuses = {}): EncyclopediaSearchDocument => {
  const fields = (['name', 'body', 'rules', 'prerequisite'] as const).filter(field => entry.text[field])
  const locale = (statuses: FieldStatuses) => Object.fromEntries(fields.map(field => [field, { text: field, status: statuses[field] ?? 'localized' }]))
  return {
    key: entry.key,
    identifiers: [entry.sourceId, ...(entry.displayNumber ? [entry.displayNumber] : [])],
    locales: { en: locale({}), zh: locale(zh) },
    extraTerms: [],
  }
}

export const itemFor = (entry: EncyclopediaEntry, zh: FieldStatuses = {}): EncyclopediaItem => ({ entry, document: documentFor(entry, zh) })

export const encyclopediaOf = (items: readonly EncyclopediaItem[]): CardEncyclopedia => ({
  languages: ['en', 'zh'],
  entries: items.map(item => item.entry),
  documents: items.map(item => item.document),
  byKey: new Map(items.map(item => [item.entry.key, item])),
})

type ImageOutcome = 'load' | 'error'

/** jsdom never fetches images; this decides each probe's outcome by URL substring. */
export const stubImages = (outcomeFor: (url: string) => ImageOutcome) => {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(url: string) {
      queueMicrotask(() => (outcomeFor(url) === 'load' ? this.onload : this.onerror)?.())
    }
  }
  return FakeImage
}

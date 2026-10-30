import {
  ENCYCLOPEDIA_GROUPS,
  type EncyclopediaEntry,
  type EncyclopediaGroup,
} from '../../shared/contract/card-encyclopedia'
import { seasonActionIdBySeason } from '../../shared/projections/season-actions'
import {
  moorMajorDisplayNumber,
  officialCardDeck,
  officialCardDisplayNumber,
} from '../../shared/projections/card-display-number'
import type { EncyclopediaSources, MajorCardSource, OrdinaryCardSource } from './sources'

const OFFICIAL_DECKS = new Set<string>(['A', 'B', 'C', 'D', 'E', 'M'])

type EntryDraft = Omit<EncyclopediaEntry, 'key' | 'cost' | 'score' | 'text'> & Partial<EncyclopediaEntry>

const entry = (draft: EntryDraft): EncyclopediaEntry => ({
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
  text: { name: [], body: [] },
  ...draft,
  key: `${draft.sourceKind}:${draft.sourceId}`,
})

const isOfficialOrdinaryCard = (card: OrdinaryCardSource) =>
  OFFICIAL_DECKS.has(card.deck) && officialCardDeck(card.id) === card.deck

const ordinaryPublicType = (card: OrdinaryCardSource): 'minor' | 'occupation' => {
  if (card.kind !== 'playerAction') return card.kind
  if (!card.playerActionCardType) throw new Error(`${card.id} has no public card type`)
  return card.playerActionCardType
}

const ordinaryEntry = (card: OrdinaryCardSource): EncyclopediaEntry => {
  const publicType = ordinaryPublicType(card)
  return entry({
    sourceKind: 'card',
    sourceId: card.id,
    group: card.deck as EncyclopediaGroup,
    publicType,
    displayNumber: officialCardDisplayNumber(card.id) ?? null,
    face: { kind: 'card', cardId: card.id, cardType: publicType },
  })
}

const majorGroup = (card: MajorCardSource, sources: EncyclopediaSources): EncyclopediaGroup => {
  if (moorMajorDisplayNumber(card.id)) return 'M'
  if (sources.baseMajorIds.includes(card.id)) return 'major'
  if (sources.fiveSixMajorIds.includes(card.id)) return 'majorFiveSix'
  throw new Error(`${card.id} is not part of any published major improvement supply`)
}

const majorEntry = (card: MajorCardSource, sources: EncyclopediaSources): EncyclopediaEntry => entry({
  sourceKind: 'major',
  sourceId: card.id,
  group: majorGroup(card, sources),
  publicType: 'major',
  displayNumber: officialCardDisplayNumber(card.id) ?? null,
  face: { kind: 'card', cardId: card.id, cardType: 'major' },
})

const groupIndex = (group: EncyclopediaGroup) => ENCYCLOPEDIA_GROUPS.indexOf(group)
const compareCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Default catalog order: declared group order, then display number (numbered first), then stable source id. */
export const compareEncyclopediaEntries = (a: EncyclopediaEntry, b: EncyclopediaEntry) =>
  groupIndex(a.group) - groupIndex(b.group)
  || (a.displayNumber === null ? 1 : 0) - (b.displayNumber === null ? 1 : 0)
  || compareCodeUnits(a.displayNumber ?? '', b.displayNumber ?? '')
  || compareCodeUnits(a.sourceId, b.sourceId)

export const buildEncyclopediaEntries = (sources: EncyclopediaSources): EncyclopediaEntry[] => {
  const entries: EncyclopediaEntry[] = [
    ...sources.ordinaryCards.filter(isOfficialOrdinaryCard).map(ordinaryEntry),
    ...sources.majorCards.map((card) => majorEntry(card, sources)),
    ...sources.parentCards.map((card) => entry({
      sourceKind: 'parent',
      sourceId: card.id,
      group: 'parents',
      publicType: card.kind,
      displayNumber: card.id,
      face: { kind: 'parent', parentId: card.id },
    })),
    ...sources.moorSpecialActionCards.map((card) => entry({
      sourceKind: 'moorSpecialAction',
      sourceId: card.id,
      group: 'moor',
      publicType: 'moorSpecialAction',
      displayNumber: null,
      face: { kind: 'moorSpecialAction', image: card.image, actions: [...card.actions], players: [...card.players] },
    })),
    ...sources.moorStartCards.map((card) => entry({
      sourceKind: 'moorStart',
      sourceId: card.id,
      group: 'moor',
      publicType: 'moorStart',
      displayNumber: null,
      face: { kind: 'moorStart', tiles: card.terrain.map(({ row, col, kind }) => ({ row, col, kind })) },
    })),
    ...sources.seasons.map((season) => entry({
      sourceKind: 'season',
      sourceId: season,
      group: 'seasons',
      publicType: 'season',
      displayNumber: null,
      face: { kind: 'season', season, actionId: seasonActionIdBySeason[season] },
    })),
  ]
  const seen = new Set<string>()
  for (const { key } of entries) {
    if (seen.has(key)) throw new Error(`Duplicate encyclopedia entry ${key}`)
    seen.add(key)
  }
  return entries.sort(compareEncyclopediaEntries)
}

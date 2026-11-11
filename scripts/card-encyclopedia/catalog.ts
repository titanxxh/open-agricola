import {
  ENCYCLOPEDIA_GROUPS,
  type EncyclopediaCost,
  type EncyclopediaCostPath,
  type EncyclopediaEntry,
  type EncyclopediaGroup,
  type EncyclopediaPlayers,
  type EncyclopediaScore,
} from '../../shared/contract/card-encyclopedia'
import type { CardDefinition } from '../../shared/contract/cards'
import { PAYMENT_RESOURCE_KEYS } from '../../shared/contract/resource-keys'
import type { ComplexCost, PaymentResourceMap } from '../../shared/contract/types'
import type { ParentCardDefinition } from '../../shared/parents'
import {
  moorMajorDisplayNumber,
  officialCardDeck,
  officialCardDisplayNumber,
} from '../../shared/projections/card-display-number'
import { isScanSkin, scanPlainText, scanPrintedText, type ScanCard } from '../../shared/scan-cards'
import type { EncyclopediaSources, MajorCardSource, OrdinaryCardSource } from './sources'
import { cardTexts, moorSpecialActionTexts, moorStartTexts, parentTexts, seasonTexts } from './text'

const OFFICIAL_DECKS = new Set<string>(['A', 'B', 'C', 'D', 'E', 'M'])
const PRINTED_RESOURCES = new Set<string>(PAYMENT_RESOURCE_KEYS)
const PRINTED_COMPLEX_COST_FIELDS = new Set(['fee', 'fees', 'cards'])

type EntryDraft = Omit<EncyclopediaEntry, 'key' | 'cost' | 'score' | 'players'> & Partial<EncyclopediaEntry>

const entry = (draft: EntryDraft): EncyclopediaEntry => ({
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
  players: null,
  ...draft,
  key: `${draft.sourceKind}:${draft.sourceId}`,
})

const printedPath = (cardId: string, map: PaymentResourceMap): EncyclopediaCostPath => {
  for (const [resource, amount] of Object.entries(map)) {
    if (!PRINTED_RESOURCES.has(resource)) throw new Error(`${cardId} prints unsupported cost resource ${resource}`)
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`${cardId} prints invalid ${resource} cost ${String(amount)}`)
    }
  }
  const path: Partial<Record<(typeof PAYMENT_RESOURCE_KEYS)[number], number>> = {}
  for (const resource of PAYMENT_RESOURCE_KEYS) {
    const amount = map[resource] ?? 0
    if (amount > 0) path[resource] = amount
  }
  return path
}

const asComplexCost = (cardId: string, cost: PaymentResourceMap | ComplexCost): ComplexCost | undefined => {
  const fields = Object.keys(cost).filter((field) => !PRINTED_RESOURCES.has(field))
  if (fields.length === 0) return undefined
  const unsupported = fields.filter((field) => !PRINTED_COMPLEX_COST_FIELDS.has(field))
  const complex = cost as ComplexCost
  if (complex.cards?.cost || complex.cards?.required) unsupported.push('cards.cost/required')
  if (unsupported.length > 0) throw new Error(`${cardId} has cost fields the encyclopedia cannot print: ${unsupported.join(', ')}`)
  return complex
}

/** Printed candidates follow the payment semantics: `fees`, else `fee`, else the plain map; then `altCosts`. */
export const projectPrintedCost = (card: Pick<CardDefinition, 'id' | 'cost' | 'altCosts' | 'returnCards'>): EncyclopediaCost => {
  const complex = card.cost ? asComplexCost(card.id, card.cost) : undefined
  const base: PaymentResourceMap[] = complex
    ? complex.fees ?? (complex.fee ? [complex.fee] : [])
    : card.cost ? [card.cost as PaymentResourceMap] : []
  const seen = new Set<string>()
  const paths = [...base, ...(card.altCosts ?? [])]
    .map((map) => printedPath(card.id, map))
    .filter((path) => {
      const signature = JSON.stringify(path)
      if (Object.keys(path).length === 0 || seen.has(signature)) return false
      seen.add(signature)
      return true
    })
  const returnCards = card.returnCards ?? complex?.cards?.list
  const upgrade = returnCards?.length ? { returnCards: [...returnCards] } : {}
  return paths.length > 0 ? { kind: 'printed', paths, ...upgrade } : { kind: 'unlisted', ...upgrade }
}

const cardScore = (card: Pick<CardDefinition, 'vp' | 'extraVp'>): EncyclopediaScore => ({
  fixed: typeof card.vp === 'number' ? card.vp : null,
  extraVp: card.extraVp === true,
})

export const projectPlayers = (card: Pick<CardDefinition, 'id' | 'players'>): EncyclopediaPlayers | null => {
  if (card.players === undefined) return null
  const minimum = /^([1-6])\+$/.exec(card.players)?.[1]
  if (!minimum) throw new Error(`${card.id} prints an unsupported player count ${card.players}`)
  return { minimum: Number(minimum) }
}

const parentScore = (card: ParentCardDefinition): EncyclopediaScore => card.kind === 'mother'
  ? { fixed: card.score, extraVp: false }
  : { fixed: null, extraVp: card.rewards.some((reward) => reward.effects.some((effect) => effect.type === 'bonus-points')) }

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
    players: projectPlayers(card),
    face: { kind: 'card', cardId: card.id, cardType: publicType },
    text: cardTexts(card),
    cost: projectPrintedCost(card),
    score: cardScore(card),
  })
}

const majorGroup = (card: MajorCardSource, sources: EncyclopediaSources): EncyclopediaGroup => {
  if (moorMajorDisplayNumber(card.id)) return 'majorMoor'
  if (sources.baseMajorIds.includes(card.id)) return 'majorStandard'
  if (sources.fiveSixMajorIds.includes(card.id)) return 'major56'
  throw new Error(`${card.id} is not part of any published major improvement supply`)
}

const majorEntry = (card: MajorCardSource, sources: EncyclopediaSources): EncyclopediaEntry => entry({
  sourceKind: 'major',
  sourceId: card.id,
  group: majorGroup(card, sources),
  publicType: 'major',
  displayNumber: officialCardDisplayNumber(card.id) ?? null,
  players: projectPlayers(card),
  face: { kind: 'card', cardId: card.id, cardType: 'major' },
  text: cardTexts(card),
  cost: projectPrintedCost(card),
  score: cardScore(card),
})

const SCAN_PUBLIC_TYPE = {
  occupation: 'occupation',
  minor: 'minor',
  major: 'major',
  'alien-artifact': 'alienArtifact',
  'illustrated-action': 'illustratedAction',
  'space-merchant': 'spaceMerchant',
  'alien-event': 'alienEvent',
  event: 'event',
  'landscape-event': 'globalEvent',
  offspring: 'offspring',
  guest: 'guest',
  'crop-circles': 'alienEvent',
  'expansion-rules': 'expansionRules',
} as const

const scanEntry = (card: ScanCard): EncyclopediaEntry => {
  const printed = isScanSkin(card) && card.cost && Object.keys(card.cost).length > 0
    ? { kind: 'printed' as const, paths: [card.cost] }
    : isScanSkin(card)
      ? { kind: 'unlisted' as const }
      : { kind: 'notApplicable' as const }
  const fixed = (isScanSkin(card) || card.layout === 'alien-artifact') && typeof card.vp === 'number'
    ? card.vp
    : card.layout === 'event' && card.mark !== undefined
      ? card.mark
      : (card.layout === 'space-merchant' || card.layout === 'alien-event')
        && card.bannerKind === 'score' && card.bannerValue !== undefined
        ? card.bannerValue
        : null
  return entry({
    sourceKind: 'scan',
    sourceId: card.id,
    group: card.group,
    publicType: SCAN_PUBLIC_TYPE[card.layout],
    displayNumber: 'number' in card ? card.number : null,
    players: isScanSkin(card) ? projectPlayers({ id: card.id, players: card.players }) : null,
    face: { kind: 'scan', cardId: card.id },
    text: {
      name: [{ literal: card.name }],
      ...(card.text ? { body: [{ literal: scanPlainText(scanPrintedText(card)) }] } : {}),
      ...(isScanSkin(card) && card.prerequisite ? { prerequisite: [{ literal: scanPlainText(card.prerequisite) }] } : {}),
    },
    cost: printed,
    score: { fixed, extraVp: 'bonusPoints' in card && card.bonusPoints === true },
  })
}

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
      text: parentTexts(card),
      score: parentScore(card),
    })),
    ...sources.moorSpecialActionCards.map((card) => entry({
      sourceKind: 'moorSpecialAction',
      sourceId: card.id,
      group: 'moor',
      publicType: 'moorSpecialAction',
      displayNumber: null,
      players: { counts: [...card.players] },
      face: { kind: 'moorSpecialAction', image: card.image, actions: [...card.actions] },
      text: moorSpecialActionTexts(card),
    })),
    ...sources.moorStartCards.map((card) => entry({
      sourceKind: 'moorStart',
      sourceId: card.id,
      group: 'moor',
      publicType: 'moorStart',
      displayNumber: null,
      face: { kind: 'moorStart', tiles: card.terrain.map(({ row, col, kind }) => ({ row, col, kind })) },
      text: moorStartTexts(card),
    })),
    ...sources.scanCards.map(scanEntry),
    ...sources.seasons.map((season) => entry({
      sourceKind: 'season',
      sourceId: season,
      group: 'seasons',
      publicType: 'season',
      displayNumber: null,
      face: { kind: 'season', season },
      text: seasonTexts(season),
    })),
  ]
  const seen = new Set<string>()
  for (const { key } of entries) {
    if (seen.has(key)) throw new Error(`Duplicate encyclopedia entry ${key}`)
    seen.add(key)
  }
  return entries.sort(compareEncyclopediaEntries)
}

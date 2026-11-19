import type { ClassicPoolShortfall } from '../contract/card-edition'
import { classicCardsNeededPerType, compareClassicPool, formatClassicPoolShortfall } from '../contract/card-edition'
import { getClassicCardKind, getEligibleClassicCardIds, getSelectableClassicDeckIds, normalizeClassicDeckIds } from '../cards/classic-catalog'
import type { GameState, OrdinaryCardDecks } from '../contract/types'
import { cardIdsInDraft } from '../draft/draft-manager'
import { createSeededRng, shuffleWithRng } from '../utils/rng'
import type { InitialStateOptions } from './state-constants'

/** Compares the cards each type needs with the eligible cards only; Workshop cards in the pool never count. */
export const classicPoolShortfall = (
  classicDeckIds: readonly string[],
  playerCount: number,
  neededPerType: number,
): ClassicPoolShortfall | null => {
  const eligible = getEligibleClassicCardIds(classicDeckIds, playerCount)
  return compareClassicPool(classicDeckIds, playerCount, neededPerType, {
    occupation: eligible.occupation.length,
    minor: eligible.minor.length,
  })
}

/**
 * The creation check for a classic game (ADR 0049): whether the eligible cards of its normalized Classic Decks fill
 * every hand, or every draft packet, for `playerCount` seats. Revised games always pass. Admission calls it with the
 * room's `maxPlayers`; creation asserts the same through `ClassicPoolInsufficientError`.
 */
export const getClassicDealShortfall = (
  options: Pick<InitialStateOptions, 'cardEdition' | 'classicDeckIds' | 'playerCount' | 'draftMode' | 'draftPoolSize'>,
): ClassicPoolShortfall | null => {
  if (options.cardEdition !== 'classic') return null
  const playerCount = Math.max(1, Math.min(6, Math.floor(options.playerCount ?? 2)))
  return classicPoolShortfall(normalizeClassicDeckIds(options.classicDeckIds), playerCount, classicCardsNeededPerType({
    playerCount, draftMode: options.draftMode, draftPoolSize: options.draftPoolSize,
  }))
}

/** Rebuilds the missing classic draw pile in a legacy recovery snapshot. */
export function rebuildLegacyClassicDecks(state: GameState): OrdinaryCardDecks {
  const seed = state.gameSeed
  const decks = state.classicDeckIds
  if (!(typeof seed === 'number' && Number.isFinite(seed)) && !(typeof seed === 'string' && seed.length > 0)) {
    throw new Error('Classic deck recovery requires the saved Game Seed')
  }
  const availableDecks = new Set(getSelectableClassicDeckIds())
  if (!Array.isArray(decks) || decks.length === 0 || !decks.every(deck => availableDecks.has(deck))) {
    throw new Error('Classic deck recovery requires the saved Classic Decks')
  }

  const pending = Object.values(state.ordinaryCardDrawChoices ?? {})
  if ((state.nextOrdinaryCardDrawChoiceSeq ?? 1) !== pending.length + 1) {
    throw new Error('Classic deck recovery requires the missing cards from the ordinary draw history')
  }
  const draftDiscardedCards = state.draft
    ? state.draft.stages.some(stage => stage.poolSize > stage.totalRounds &&
      Object.values(stage.seats).some(({ kept }) => Math.max(kept.occ.length, kept.minor.length) >= stage.totalRounds))
    : state.draftMode === 'simultaneous' && (state.draftPoolSize ?? 7) > 7
  if (draftDiscardedCards) throw new Error('Classic deck recovery requires the cards discarded during the draft')

  const unavailable = cardIdsInDraft(state.draft)
  for (const player of state.players) {
    for (const id of player.occupationHand) unavailable.occupation.add(id)
    for (const id of player.occupationPlayed ?? []) unavailable.occupation.add(id)
    for (const id of player.minorHand) unavailable.minor.add(id)
    for (const id of player.minorPlayed ?? []) unavailable.minor.add(id)
  }
  for (const choice of pending) {
    for (const id of choice.candidates) unavailable[choice.cardType].add(id)
  }
  for (const event of state.events) {
    if (event.type === 'card.played' || event.type === 'card.returnedToBoard') {
      const kind = getClassicCardKind(event.cardId)
      if (kind) unavailable[kind].add(event.cardId)
    }
  }

  const pool = getEligibleClassicCardIds(decks, state.players.length)
  const rng = createSeededRng(seed, 'legacy-classic-ordinary-card-deck')
  return {
    occupation: shuffleWithRng(pool.occupation.filter(id => !unavailable.occupation.has(id)), rng),
    minor: shuffleWithRng(pool.minor.filter(id => !unavailable.minor.has(id)), rng),
  }
}

/** Thrown by a classic deal whose eligible pool cannot fill every hand; `code` and `shortfall` match the check. */
export class ClassicPoolInsufficientError extends Error {
  readonly code = 'classic_pool_insufficient'
  readonly shortfall: ClassicPoolShortfall

  constructor(shortfall: ClassicPoolShortfall) {
    super(formatClassicPoolShortfall(shortfall))
    this.name = 'ClassicPoolInsufficientError'
    this.shortfall = shortfall
  }
}

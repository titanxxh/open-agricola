import type { ClassicPoolShortfall } from '../contract/card-edition'
import { classicCardsNeededPerType, compareClassicPool, formatClassicPoolShortfall } from '../contract/card-edition'
import { getEligibleClassicCardIds, normalizeClassicDeckIds } from '../cards/classic-catalog'
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

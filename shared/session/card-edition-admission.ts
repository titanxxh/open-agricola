import { CLASSIC_EDITION_ENABLED, type ClassicAdmissionErrorCode, type ClassicPoolShortfall } from '../contract/card-edition'
import { normalizeClassicDeckIds } from '../cards/classic-catalog'
import { ClassicPoolInsufficientError, getClassicDealShortfall } from './classic-deal-pool'
import type { InitialStateOptions } from './state-constants'

/** The edition part of a creation request; revised leaves both fields out, as in game state. */
export type CardEditionChoice =
  | { cardEdition?: never; classicDeckIds?: never }
  | { cardEdition: 'classic'; classicDeckIds: string[] }

export type ClassicAdmissionRejection =
  | { code: Exclude<ClassicAdmissionErrorCode, 'classic_pool_insufficient'>; error: string }
  | { code: 'classic_pool_insufficient'; error: string; shortfall: ClassicPoolShortfall }

export class ClassicAdmissionError extends Error {
  readonly rejection: ClassicAdmissionRejection

  constructor(rejection: ClassicAdmissionRejection) {
    super(rejection.error)
    this.name = 'ClassicAdmissionError'
    this.rejection = rejection
  }
}

/**
 * Reads `cardEdition` and `classicDeckIds` from a raw creation payload. A missing edition or `'revised'` is revised;
 * a classic choice gets its Classic Decks normalized (trimmed, uppercased, filtered, default when none is left). Any
 * other edition value is an invalid request.
 */
export const parseCardEditionChoice = (raw: Record<string, unknown>): CardEditionChoice => {
  if (raw.cardEdition === undefined || raw.cardEdition === null || raw.cardEdition === 'revised') return {}
  if (raw.cardEdition !== 'classic') throw new Error(`invalid cardEdition: ${String(raw.cardEdition)}`)
  return { cardEdition: 'classic', classicDeckIds: normalizeClassicDeckIds(raw.classicDeckIds) }
}

const EXCLUSIVE_OPTIONS: ReadonlyArray<readonly [(options: InitialStateOptions) => boolean, string]> = [
  [options => options.enableFarmersOfTheMoor === true, 'Farmers of the Moor'],
  [options => options.enableCommunityDeck === true, 'the community deck'],
  [options => options.enableParentCards === true, 'Parent Cards'],
  [options => options.enableThroughTheSeasons === true, 'Through the Seasons'],
  [options => (options.playerCount ?? 2) === 1, 'a solo game'],
]

/** Checks the switch and incompatible options for new games and saved Workshop setups. */
export const classicSetupRejection = (
  options: InitialStateOptions,
  classicEditionEnabled: boolean,
): Exclude<ClassicAdmissionRejection, { code: 'classic_pool_insufficient' }> | null => {
  if (options.cardEdition !== 'classic') return null
  if (!classicEditionEnabled) {
    return { code: 'classic_edition_disabled', error: 'Classic card games are not available' }
  }
  const excluded = EXCLUSIVE_OPTIONS.find(([enabled]) => enabled(options))
  if (excluded) {
    return { code: 'classic_edition_incompatible', error: `Classic cards cannot be combined with ${excluded[1]}` }
  }
  return null
}

/**
 * Creation checks the Classic Deck pool for all seats in addition to the setup.
 * Existing games load, resume and replay independently of this check.
 */
export const classicAdmissionRejection = (
  options: InitialStateOptions,
  classicEditionEnabled: boolean = CLASSIC_EDITION_ENABLED,
): ClassicAdmissionRejection | null => {
  const setupRejection = classicSetupRejection(options, classicEditionEnabled)
  if (setupRejection) return setupRejection
  const shortfall = getClassicDealShortfall(options)
  return shortfall ? { code: shortfall.code, error: new ClassicPoolInsufficientError(shortfall).message, shortfall } : null
}

import { CLASSIC_EDITION_ENABLED, type ClassicAdmissionErrorCode } from '../contract/card-edition'
import { normalizeClassicDeckIds } from '../cards/classic-catalog'
import { ClassicPoolInsufficientError, getClassicDealShortfall } from './classic-deal-pool'
import type { InitialStateOptions } from './state-constants'

/** The edition part of a creation request; revised leaves both fields out, as in game state. */
export type CardEditionChoice = Pick<InitialStateOptions, 'cardEdition' | 'classicDeckIds'>

export type ClassicAdmissionRejection = { code: ClassicAdmissionErrorCode; error: string }

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

/**
 * Creation admission of the classic option (ADR 0049), shared by every entry that creates a game: room creation and
 * rematch, the HTTP sandboxes, the browser sandbox Worker and Workshop sandbox settings. `options` are the initial
 * state options about to be created, with `playerCount` the room's `maxPlayers`. Revised options always pass.
 * `classicEditionEnabled` defaults to the build's switch; tests inject either value. Loading, continuing,
 * reconnecting to and replaying an existing classic game never come here.
 */
export const classicAdmissionRejection = (
  options: InitialStateOptions,
  classicEditionEnabled: boolean = CLASSIC_EDITION_ENABLED,
): ClassicAdmissionRejection | null => {
  if (options.cardEdition !== 'classic') return null
  if (!classicEditionEnabled) {
    return { code: 'classic_edition_disabled', error: 'Classic card games are not available' }
  }
  const excluded = EXCLUSIVE_OPTIONS.find(([enabled]) => enabled(options))
  if (excluded) {
    return { code: 'classic_edition_incompatible', error: `Classic cards cannot be combined with ${excluded[1]}` }
  }
  const shortfall = getClassicDealShortfall(options)
  return shortfall ? { code: shortfall.code, error: new ClassicPoolInsufficientError(shortfall).message } : null
}

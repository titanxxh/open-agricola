import type { GameState, PlayerState } from '../../contract/types'
import { getMinorImprovement } from '../../cards/registry-display'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import type { ImprovementType } from './improvement'

type ResolvedMinorImprovement = NonNullable<ReturnType<typeof getMinorImprovement>>

/**
 * BGA `isBuyable` actionType gate: cards flagged
 * `mustBePlayedViaMajorImprovementAction` (e.g. A10 Wooden Shed) cannot be
 * bought through the Minor-Improvement action space (types=['minor']).
 * Returns true when `types` is exactly `['minor']` (minor-only sub-flow).
 *
 * When `types` is `['major', 'minor']` or undefined (card-effect plays
 * without action context), the gate is open.
 */
export const isBlockedByMajorImprovementActionGate = (
  improvement: ResolvedMinorImprovement | undefined,
  types?: readonly ImprovementType[],
): boolean => {
  if (!improvement?.mustBePlayedViaMajorImprovementAction) return false
  // BGA actionType === 'Minor' (i.e. minor-only sub-flow): types is exactly ['minor'].
  return types !== undefined && types.length === 1 && types[0] === 'minor'
}

/**
 * Pool-side eligibility: is this major present in the current pool and
 * (optionally) within the allowed-purchases whitelist?
 */
export const canPlayMajor = (
  state: GameState,
  improvementId: string,
  allowedPurchases?: string[],
): boolean => {
  if (!state.availableMajorImprovements.includes(improvementId)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvementId)) return false
  return true
}

/**
 * Pool-side eligibility: is this minor in the player's hand, prerequisite-
 * satisfied, action-gate compatible, and within allowed-purchases?
 */
export const canPlayMinor = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  types?: readonly ImprovementType[],
  allowedPurchases?: string[],
): boolean => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return false
  if (!player.minorHand.includes(improvement.id)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvement.id)) return false
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) return false
  if (isBlockedByMajorImprovementActionGate(improvement, types)) return false
  return true
}

/**
 * Read-only snapshot of currently available major improvements.
 */
export const listAvailableMajors = (state: GameState): string[] => [
  ...state.availableMajorImprovements,
]

/**
 * Read-only snapshot of the player's current minor-improvement hand.
 */
export const listMinorHand = (player: PlayerState): string[] => [...player.minorHand]

/**
 * Mutate the pool: remove a major from `availableMajorImprovements`. Used
 * when the major is purchased (and so transferred to `player.improvements`).
 */
export const removeMajorFromPool = (state: GameState, improvementId: string): void => {
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvementId,
  )
}

/**
 * Mutate the player's hand: remove a minor card from `minorHand` (caller is
 * responsible for pushing it onto `minorPlayed` and updating stats).
 */
export const removeMinorFromHand = (player: PlayerState, improvementId: string): void => {
  player.minorHand = player.minorHand.filter((id) => id !== improvementId)
}

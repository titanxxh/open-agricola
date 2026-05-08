import type { GameState, PlayerState } from '../../contract/types'
import { getMinorImprovement } from '../../cards-display/_lookup'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'

type ResolvedMinorImprovement = NonNullable<ReturnType<typeof getMinorImprovement>>

/**
 * BGA `isBuyable` actionType gate: cards flagged
 * `mustBePlayedViaMajorImprovementAction` (e.g. A10 Wooden Shed) cannot be
 * bought through the Minor-Improvement action space. Returns false when the
 * caller's `actionCardId` is `'minor-improvement'` (BGA `actionType=Minor`).
 *
 * `improvement-any` (Major Improvement space) always allows it; card-effect
 * plays without an actionCardId pass through (some listeners replay onBuy
 * paths without the action context — those should not be blocked).
 */
export const isBlockedByMajorImprovementActionGate = (
  improvement: ResolvedMinorImprovement,
  actionCardId: string | undefined,
): boolean =>
  !!improvement.mustBePlayedViaMajorImprovementAction
    && actionCardId === 'minor-improvement'

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
  actionCardId: string | undefined,
  allowedPurchases?: string[],
): boolean => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) return false
  if (!player.minorHand.includes(improvement.id)) return false
  if (allowedPurchases && !allowedPurchases.includes(improvement.id)) return false
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) return false
  if (isBlockedByMajorImprovementActionGate(improvement, actionCardId)) return false
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

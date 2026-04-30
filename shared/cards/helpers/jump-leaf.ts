import type { ActionFlow } from '../../game/types'
import type { CardListenerContext } from '../card-listeners'

export interface JumpLeafParams {
  sourceCard: string
  /**
   * Worker to relocate. When omitted (worker-less mode), the place-farmer jump
   * branch skips worker mutation, placement reachability validation, and stats
   * increments — the jump still expands the target space's full flow and
   * dispatches cascade listeners. Worker-less mode is used by cards that fire
   * during return-home phase (no farmer in hand) such as A151 Minstrel.
   */
  workerId?: string
  targetSpaceId: string
}

/**
 * Build a place-farmer leaf in jump mode (viaCardJump).
 * The place-farmer effect's jump branch:
 *   1. (worker mode only) moves the worker from its current space to targetSpaceId
 *   2. accumulates jumpChain (mutates actionContext)
 *   3. (worker mode only) increments stats.placedFarmers
 *   4. returns a flow that runs the placement through the engine's ActionNode
 *      path (so ReplaceHook / computeCosts / isDoable / before listener all
 *      dispatch identically to a direct placement).
 */
export const jumpLeaf = (p: JumpLeafParams): ActionFlow => ({
  type: 'leaf',
  actionId: 'place-farmer',
  expandFlow: true,
  sourceCard: p.sourceCard,
  actionContext: {
    viaCardJump: true,
    sourceCard: p.sourceCard,
    ...(p.workerId !== undefined ? { workerId: p.workerId } : {}),
    targetSpaceId: p.targetSpaceId,
  },
})

/** Listener self-check: skip if my CARD_ID is already in jumpChain. */
export const isJumpChainContains = (
  context: CardListenerContext,
  cardId: string,
): boolean => {
  const chain = context.actionContext?.jumpChain
  return Array.isArray(chain) && chain.includes(cardId)
}

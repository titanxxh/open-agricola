import type { ActionFlow } from '../../game/types'
import type { CardListenerContext } from '../card-listeners'

export interface JumpLeafParams {
  sourceCard: string
  workerId: string
  targetSpaceId: string
}

/**
 * Build a place-farmer leaf in jump mode (viaCardJump).
 * The place-farmer effect's jump branch:
 *   1. moves the worker from its current space to targetSpaceId
 *   2. accumulates jumpChain (mutates actionContext)
 *   3. increments stats.placedFarmers
 *   4. returns a flow that runs the second placement through the engine's
 *      ActionNode path (so ReplaceHook / computeCosts / isDoable / before
 *      listener all dispatch identically to a direct placement).
 */
export const jumpLeaf = (p: JumpLeafParams): ActionFlow => ({
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: p.sourceCard,
  actionContext: {
    viaCardJump: true,
    sourceCard: p.sourceCard,
    workerId: p.workerId,
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

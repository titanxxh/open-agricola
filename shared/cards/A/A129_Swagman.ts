import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import type { CardImpl } from '../registry'
import { A129_Swagman } from '../../cards-display/A/A129_Swagman'
export { A129_Swagman }

const CARD_ID = A129_Swagman.id

const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'grain-seeds',
  'grain-seeds': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'A129-swagman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.A129_Swagman.choice',
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId: myRef.workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A129_Swagman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

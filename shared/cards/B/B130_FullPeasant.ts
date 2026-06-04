import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/helpers/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B130_FullPeasant'
const TRIGGER_PAIRS: Record<string, string> = {
  'grain-utilization': 'fencing',
  fencing: 'grain-utilization',
}

const listener: CardListenerRegistration = {
  id: 'B130-full-peasant-after-place-farmer',
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

    if ((context.player.resources.food ?? 0) < 1) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B130_FullPeasant.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B130_FullPeasant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Full Peasant',
    deck: 'B',
    number: 130,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time after you use the __Grain Utilization__ or __Fencing__ action space while the other is unoccupied, you can pay 1 <FOOD> to use the other space with the same person.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B130_FullPeasant_impl = B130_FullPeasant.impl

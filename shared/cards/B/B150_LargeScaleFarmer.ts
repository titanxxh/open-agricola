import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/effects/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B150_LargeScaleFarmer'

const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'major-improvement',
  'major-improvement': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'B150-large-scale-farmer-after-place-farmer',
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
        choiceLabelKey: 'cards.B150_LargeScaleFarmer.choice',
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

export const B150_LargeScaleFarmer = new Occupation({
  id: CARD_ID,
  name: 'Large-Scale Farmer',
  deck: 'B',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Farm Expansion__ or __Major Improvement__ action space while the other is unoccupied, you can pay 1 <FOOD> to use that other space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})

export const B150_LargeScaleFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B130_FullPeasant'

// B130 Full Peasant: Each time after you use the Grain Utilization OR Fencing action space
// while the other is unoccupied, you can pay 1 food to use the other space with the same person.
//
// BGA (php): listens to PlaceFarmer on GrainUtilization/Fencing (unflagged), returns optional
//   SEQ: [pay 1 food, flagCard, useActionSpace(other), unflagCard].
//
// Our implementation mirrors A151_Minstrel / A150_Stagehand: inline the chained action's
// effect as leaf flow (trueAction=false). No self-chain risk since our chain uses
// sow/bake-bread/fence leaves, not the round-action actions themselves.

const TRIGGER_SPACES: Record<string, string> = {
  'grain-utilization': 'fencing',
  fencing: 'grain-utilization',
}

const buildChainedFlow = (otherSpaceId: string): ActionFlow | null => {
  switch (otherSpaceId) {
    case 'grain-utilization':
      return {
        type: 'or',
        promptKey: 'ui.interactionGrainUtilizationChoice',
        children: [
          { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID, actionContext: { trueAction: false } },
        ],
      }
    case 'fencing':
      return {
        type: 'leaf',
        actionId: 'fence',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      }
    default:
      return null
  }
}

const listener: CardListenerRegistration = {
  id: 'B130-full-peasant-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placedSpaceId = context.space?.id
    if (!placedSpaceId) return
    const otherSpaceId = TRIGGER_SPACES[placedSpaceId]
    if (!otherSpaceId) return

    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace) return
    if (isSpaceOccupied(otherSpace)) return
    if (!otherSpace.canBeExecutedByPlayer(context.state, context.player)) return

    // Must be able to pay food
    if ((context.player.resources.food ?? 0) < 1) return

    const chained = buildChainedFlow(otherSpaceId)
    if (!chained) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B130_FullPeasant.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          chained,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B130_FullPeasant = new Occupation({
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
  newSet: true,
})

export const B130_FullPeasant_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

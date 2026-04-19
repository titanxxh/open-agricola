import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'B150_LargeScaleFarmer'

// B150 Large-Scale Farmer: Each time after you use the Farm Expansion OR Major Improvement
// action space while the other is unoccupied, you can pay 1 food to use that other space
// with the same person.
//
// BGA (php): listens to PlaceFarmer on FarmExpansion/MajorImprovement (unflagged), returns optional
//   SEQ: [pay 1 food, flagCard, useActionSpace(other), unflagCard].
//
// We inline the chained action as leaf flows (trueAction=false).

const TRIGGER_SPACES: Record<string, string> = {
  'farm-expansion': 'major-improvement',
  'major-improvement': 'farm-expansion',
}

const buildChainedFlow = (otherSpaceId: string): ActionFlow | null => {
  switch (otherSpaceId) {
    case 'farm-expansion':
      return {
        type: 'or',
        promptKey: 'ui.interactionFarmExpansionSelect',
        children: [
          { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID, actionContext: { trueAction: false } },
        ],
      }
    case 'major-improvement':
      return {
        type: 'leaf',
        actionId: 'improvement-any',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      }
    default:
      return null
  }
}

const listener: CardListenerRegistration = {
  id: 'B150-large-scale-farmer-after-place-farmer',
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
    if ((context.player.resources.food ?? 0) < 1) return

    const chained = buildChainedFlow(otherSpaceId)
    if (!chained) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B150_LargeScaleFarmer.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          chained,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

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

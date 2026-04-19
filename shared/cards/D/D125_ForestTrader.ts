import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'D125_ForestTrader'

// Each time you use a wood or clay accumulation space,
// optionally buy exactly 1 building resource:
// Wood/Clay/Reed = 1 food; Stone = 2 food.
// Triggers before collect (isBeforeCollectEvent in BGA).
const listener: CardListenerRegistration = {
  id: 'D125-forest-trader-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isWood = (gainPerRound.wood ?? 0) > 0
    const isClay = (gainPerRound.clay ?? 0) > 0
    if (!isWood && !isClay) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { wood: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { clay: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { reed: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 2 }, gain: { stone: 1 } }).flow!,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D125_ForestTrader = new Occupation({
  id: CARD_ID,
  name: 'Forest Trader',
  deck: 'D',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use a wood or clay accumulation space, you can also buy exactly 1 building resource. <WOOD>, <CLAY>, and <REED> cost 1 <FOOD> each; <STONE> costs 2 food.'],
  cost: {},
  players: '1+',
  newSet: true,
})

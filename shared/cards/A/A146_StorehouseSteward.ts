import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A146_StorehouseSteward'

const isFoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.food ?? 0) > 0

// A146 Storehouse Steward: Each time you take exactly 2/3/4/5 food from a food accumulation space,
// you also get 1 stone/reed/clay/wood. (6+ gives no bonus)
// BGA checks count($event['meeples']) which maps to food gained
const listener: CardListenerRegistration = {
  id: 'A146-storehouse-steward-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (!isFoodAccumulationSpace(context.space)) return
    const foodGained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.food ?? 0)
      : 0
    let gain: { stone?: number; reed?: number; clay?: number; wood?: number } | null = null
    if (foodGained === 2) {
      gain = { stone: 1 }
    } else if (foodGained === 3) {
      gain = { reed: 1 }
    } else if (foodGained === 4) {
      gain = { clay: 1 }
    } else if (foodGained === 5) {
      gain = { wood: 1 }
    }
    if (!gain) return
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A146_StorehouseSteward = new Occupation({
  id: CARD_ID,
  name: 'Storehouse Steward',
  deck: 'A',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you take exactly 2/3/4/5 <FOOD> from a food accumulation space, you also get 1 <STONE>/<REED>/<CLAY>/<WOOD>. (If you take 6 or more <FOOD>, you do not get a bonus good).'],
  cost: {},
  players: '3+',
  newSet: true,
})

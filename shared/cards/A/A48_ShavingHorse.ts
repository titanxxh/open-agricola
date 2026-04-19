import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A48_ShavingHorse'

/**
 * A48 Shaving Horse (MinorImprovement, A, 48)
 * After gaining wood from an action space, you can optionally exchange 1 wood for 3 food.
 */

const WOOD_SPACES = new Set(['copse', 'forest', 'grove', 'resource-market-4'])

const exchangeFlow = (woodAfterGain: number): ActionHookResult | void => {
  if (woodAfterGain < 5) return
  const mandatory = woodAfterGain >= 7
  return {
    flow: {
      type: 'seq',
      optional: !mandatory,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
        gainLeaf(CARD_ID, { food: 3 }),
      ],
    },
    sourceCard: CARD_ID,
  }
}

const afterCollectListener: CardListenerRegistration = {
  id: 'A48-shaving-horse-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained = (context.result as any)?.resourcesGained?.wood ?? 0
    if (gained <= 0) return
    return exchangeFlow(context.player.resources.wood ?? 0)
  },
}

const afterGainListener: CardListenerRegistration = {
  id: 'A48-shaving-horse-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !WOOD_SPACES.has(context.space.id)) return
    const gained = (context.result as any)?.resourcesGained?.wood ?? 0
    if (gained <= 0) return
    return exchangeFlow(context.player.resources.wood ?? 0)
  },
}

registerCardListener(afterCollectListener)
registerCardListener(afterGainListener)

export const A48_ShavingHorse = new MinorImprovement({
  id: CARD_ID,
  name: 'Shaving Horse',
  deck: 'A',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: ['Each time after you obtain at least 1 <WOOD>, if you then have 5 or more <WOOD> in your supply, you can exchange 1 <WOOD> for 3 <FOOD>. With 7 or more <WOOD>, you must do so.'],
  cost: {},
})

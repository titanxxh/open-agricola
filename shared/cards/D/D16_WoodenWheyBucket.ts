import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D16_WoodenWheyBucket'

// Before using Sheep Market or Cattle Market, can build exactly 1 stable.
// Sheep Market: costs 1 WOOD; Cattle Market: free.
const listener: CardListenerRegistration = {
  id: 'D16-wooden-whey-bucket-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    if (spaceId !== 'sheep-market' && spaceId !== 'cattle-market') return
    // Sheep market: pay 1 wood; Cattle market: free
    const freeCost = spaceId === 'cattle-market'
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            params: freeCost ? { max: 1, freeCost: true } : { max: 1 },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const D16_WoodenWheyBucket = new MinorImprovement({
  id: CARD_ID,
  name: 'Wooden Whey Bucket',
  deck: 'D',
  number: 16,
  category: 'FARM_PLANNER',
  desc: ['Each time before you use the __Sheep Market__/__Cattle Market__ accumulation space, you can build exactly 1 stable for 1 <WOOD>/at no cost.'],
  cost: { wood: 1, food: 1 },
  newSet: true,
})

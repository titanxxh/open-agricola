import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'A163_BuildingExpert'

type ResourceKey = 'wood' | 'clay' | 'reed' | 'stone'

// 1st→wood, 2nd→clay, 3rd→reed, 4th→stone, 5th→stone (1-indexed)
const PLACEMENT_TO_RESOURCE: Record<number, ResourceKey> = {
  1: 'wood',
  2: 'clay',
  3: 'reed',
  4: 'stone',
  5: 'stone',
}

// A163 Building Expert: Each time you use the Resource Market action space with the
// 1st/2nd/3rd/4th/5th person you place, you also get 1 WOOD/CLAY/REED/STONE/STONE.
const listener: CardListenerRegistration = {
  id: 'A163-building-expert-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'resource-market-4') return
    const placed = getRoundPlacementOrder(context.player).length
    const resource = PLACEMENT_TO_RESOURCE[placed]
    if (!resource) return
    return { flow: gainLeaf(CARD_ID, { [resource]: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A163_BuildingExpert = new Occupation({
  id: CARD_ID,
  name: 'Building Expert',
  deck: 'A',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Resource Market__ action space with the 1st/2nd/3rd/4th/5th person you place, you also get 1 <WOOD>/<CLAY>/<REED>/<STONE>/<STONE>.'],
  cost: {},
  players: '4+',
  newSet: true,
})

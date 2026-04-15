import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'

const CARD_ID = 'D143_TreeCutter'

// Non-wood resource types to check (BGA checks all resources except wood)
const NON_WOOD_RESOURCES: (keyof Resource)[] = [
  'clay', 'reed', 'stone', 'food', 'sheep', 'boar', 'cattle', 'grain', 'vegetable',
]

const listener: CardListenerRegistration = {
  id: 'D143-tree-cutter-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.result?.type !== 'ok') return
    const gained = context.result.resourcesGained
    if (!gained) return
    // Check if any non-wood resource was collected >= 3
    const hasThreePlus = NON_WOOD_RESOURCES.some((res) => (gained[res] ?? 0) >= 3)
    if (!hasThreePlus) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D143_TreeCutter = new Occupation({
  id: CARD_ID,
  name: 'Tree Cutter',
  deck: 'D',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use an accumulation space providing at least 3 goods of the same type except <WOOD>, you get an additional 1 <WOOD>. (<FOOD> is also considered a good.)',
  ],
  cost: {},
  players: '3+',
  newSet: true,
  implemented: true,
})

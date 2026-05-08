import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D143_TreeCutter } from '../../cards-display/D/D143_TreeCutter'

const CARD_ID = D143_TreeCutter.id

const NON_WOOD_RESOURCES: (keyof Resource)[] = [
  'clay', 'reed', 'stone', 'food', 'sheep', 'boar', 'cattle', 'grain', 'vegetable',
]

const listener: CardListenerRegistration = {
  id: 'D143-tree-cutter-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.result?.type !== 'ok') return
    const gained = context.result.resourcesGained
    if (!gained) return
    // Check if any non-wood resource was collected >= 3
    const hasThreePlus = NON_WOOD_RESOURCES.some((res) => (gained[res] ?? 0) >= 3)
    if (!hasThreePlus) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

export const D143_TreeCutter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

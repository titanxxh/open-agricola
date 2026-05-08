import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { A163_BuildingExpert } from '../../cards-display/A/A163_BuildingExpert'
export { A163_BuildingExpert }

const CARD_ID = A163_BuildingExpert.id

type ResourceKey = 'wood' | 'clay' | 'reed' | 'stone'

const PLACEMENT_TO_RESOURCE: Record<number, ResourceKey> = {
  1: 'wood',
  2: 'clay',
  3: 'reed',
  4: 'stone',
  5: 'stone',
}

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

export const A163_BuildingExpert_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

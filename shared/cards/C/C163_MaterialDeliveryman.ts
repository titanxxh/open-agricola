import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C163_MaterialDeliveryman } from '../../cards-display/C/C163_MaterialDeliveryman'

const CARD_ID = C163_MaterialDeliveryman.id

/**
 * C163 Material Deliveryman:
 * scope 'any' -- when any player takes 5+ goods from an accumulation space,
 * the card owner gets 1 building resource: 5->wood, 6->clay, 7->reed, 8+->stone.
 */
const AMOUNT_RESOURCE_MAP: [number, keyof Resource][] = [
  [8, 'stone'],
  [7, 'reed'],
  [6, 'clay'],
  [5, 'wood'],
]

const GOODS: (keyof Resource)[] = [
  'wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle',
]

const listener: CardListenerRegistration = {
  id: 'C163-material-deliveryman-any-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const triggerPlayer = context.triggerPlayer ?? context.player
    const total = GOODS.reduce(
      (sum, resource) => sum + sumResourceMovedToPlayer(events, resource, triggerPlayer.id, (event) =>
        event.from.kind === 'actionSpace',
      ),
      0,
    )
    if (total < 5) return
    for (const [threshold, resource] of AMOUNT_RESOURCE_MAP) {
      if (total >= threshold) {
        return { flow: gainLeaf(CARD_ID, { [resource]: 1 }), sourceCard: CARD_ID }
      }
    }
  },
}

export const C163_MaterialDeliveryman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

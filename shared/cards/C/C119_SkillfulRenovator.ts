import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { C119_SkillfulRenovator } from '../../cards-display/C/C119_SkillfulRenovator'

const CARD_ID = C119_SkillfulRenovator.id

const afterRenovateListener: CardListenerRegistration = {
  id: 'C119-skillful-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placed = getRoundPlacementOrder(context.player).length
    if (placed <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: placed }), sourceCard: CARD_ID }
  },
}

export const C119_SkillfulRenovator_impl = {
  listeners: [afterRenovateListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

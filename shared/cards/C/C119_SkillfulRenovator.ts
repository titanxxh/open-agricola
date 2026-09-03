import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPersonPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'

const CARD_ID = 'C119_SkillfulRenovator'
const afterRenovateListener: CardListenerRegistration = {
  id: 'C119-skillful-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placed = getRoundPersonPlacementOrder(context.player).length
    if (placed <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: placed }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterRenovateListener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C119_SkillfulRenovator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Skillful Renovator',
    deck: 'C',
    number: 119,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. Each time after you renovate, you get a number of <WOOD> equal to the number of people you placed that round.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C119_SkillfulRenovator_impl = C119_SkillfulRenovator.impl

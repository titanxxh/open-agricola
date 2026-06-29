import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { sourcedMandatoryBonus } from '../helpers/renovation-cost'

const CARD_ID = 'D081_RoofLadder'
const costListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { bonuses: [sourcedMandatoryBonus(CARD_ID, { reed: 1 })] }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [costListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D081_RoofLadder = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Roof Ladder',
    deck: 'D',
    number: 81,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time you renovate, you pay 1 fewer <REED> and, at the end of the action, you get 1 <STONE>.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const D081_RoofLadder_impl = D081_RoofLadder.impl

import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { hasActionSpaceAcquisition } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E118_KindlingGatherer'
const listener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-action-space-food',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['collect', 'gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasActionSpaceAcquisition(context, ['food'])) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E118_KindlingGatherer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Kindling Gatherer',
    deck: 'E',
    number: 118,
    category: 'BUILDING_RESOURCES_-_WOOD',
    desc: ['Each time you get <FOOD> from an action space, you get 1 additional <WOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E118_KindlingGatherer_impl = E118_KindlingGatherer.impl

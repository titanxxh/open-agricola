import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E164_MountainPlowman'
const listener: CardListenerRegistration = {
  id: 'E164-mountain-plowman-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E164_MountainPlowman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Mountain Plowman',
    deck: 'E',
    number: 164,
    category: 'ANIMALS_-_SHEEP',
    desc: ['Each time you plow at least 1 field, you get 1 <SHEEP> for each field that you just plowed.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E164_MountainPlowman_impl = E164_MountainPlowman.impl

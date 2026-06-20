import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A179_MountainShepherd'
const QUARRY_SPACES = new Set(['eastern-quarry', 'western-quarry'])
const listener: CardListenerRegistration = {
  id: 'A179-mountain-shepherd-after-quarry',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!QUARRY_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A179_MountainShepherd = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Mountain Shepherd',
    deck: 'A',
    number: 179,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use either "Quarry" accumulation space, you immediately get an additional 1 sheep from the general supply.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A179_MountainShepherd_impl = A179_MountainShepherd.impl

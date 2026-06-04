import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A140_ShovelBearer'
const listener: CardListenerRegistration = {
  id: 'A140-shovel-bearer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'clay-pit' && spaceId !== 'hollow-4') return
    // Get the OTHER clay space
    const otherSpaceId = spaceId === 'clay-pit' ? 'hollow-4' : 'clay-pit'
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace) return
    const clay = otherSpace.resources?.clay ?? 0
    if (clay <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: clay }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A140_ShovelBearer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Shovel Bearer',
    deck: 'A',
    number: 140,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use the __Clay Pit__ or __Hollow__ accumulation space, you also get a number of <FOOD> equal to the amount of <CLAY> on the respective other accumulation space.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A140_ShovelBearer_impl = A140_ShovelBearer.impl

import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import type { CardImpl } from '../registry'

const CARD_ID = 'A121_ClayPuncher'
const listener: CardListenerRegistration = {
  id: 'A121-clay-puncher-after-lessons-clay',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || (context.space.id !== 'clay-pit' && !isLessonsSpaceId(context.space.id))) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A121_ClayPuncher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Clay Puncher",
    deck: "A",
    number: 121,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "When you play this card and each time after you use a __Lessons__ action space or the __Clay Pit__ accumulation space, you get 1 <CLAY>.",
      ],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A121_ClayPuncher_impl = A121_ClayPuncher.impl

import { defineMinorCard } from '../../card-source'
import type { CardListenerRegistration } from '../../card-listeners'
import { grantGuestLeaf } from '../../helpers/guest-flow'
import { payThenActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL026_SpeculoosBakery'

const afterBaking: CardListenerRegistration = {
  id: `${CARD_ID}-after-bake-bread`,
  cardIds: [CARD_ID],
  actions: ['bake-bread'],
  phases: ['after'],
  handler: ({ actionContext, player }) => {
    // An action space body stamps its origin; a card's reaction, onBuy or anytime Bake Bread carries none.
    const origin = actionContext?.sourceLocation as { kind?: unknown } | undefined
    if (origin?.kind !== 'actionSpace' || player.resources.grain < 1) return
    return payThenActionFlow({ cardId: CARD_ID, cost: { grain: 1 }, action: grantGuestLeaf(CARD_ID) })
  },
}

export const CFL026_SpeculoosBakery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Speculoos Bakery',
    deck: 'CFL',
    number: 26,
    desc: ['Each time you take a __Bake Bread__ action on an action space, you can pay 1 <GRAIN> to receive 1 Guest to use that round. Return it to the supply at the end of the round.'],
    cost: { wood: 2, clay: 2 },
    vp: 1,
    passing: false,
    extraVp: false,
  },
  impl: { listeners: [afterBaking] },
})

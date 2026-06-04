import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E115_SeedServant'
const listener: CardListenerRegistration = {
  id: 'E115-seed-servant-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'grain-seeds') {
      return {
        flow: {
          type: 'leaf',
          actionId: 'bake-bread',
          optional: true,
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
      }
    }
    if (spaceId === 'vegetable-seeds') {
      return {
        flow: {
          type: 'leaf',
          actionId: 'sow',
          optional: true,
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E115_SeedServant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seed Servant',
    deck: 'E',
    number: 115,
    category: 'CROPS_-_SOWING',
    desc: ['Each time after you use the __Grain Seeds__ action space, you can take a __Bake bread__ action. Each time after you use the __Vegetable Seeds__ action space, you can take a __Sow__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E115_SeedServant_impl = E115_SeedServant.impl

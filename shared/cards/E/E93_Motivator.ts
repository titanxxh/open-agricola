import { defineOccupationCard } from '../card-source'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farm'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E93_Motivator'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (getRoundPlacementOrder(player).length !== 0) return
    if (!hasNoUnusedFarmyardSpaces(player)) return
    if (workersAvailable(state, player) <= 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E93_Motivator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Motivator',
    deck: 'E',
    number: 93,
    desc: ['On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply.'],
    cost: {},
    players: '1+',
    category: 'ACTION_-_GUEST',
  },
  impl: cardImpl,
})

export const E93_Motivator_impl = E93_Motivator.impl

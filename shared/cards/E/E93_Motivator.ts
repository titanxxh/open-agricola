import { Occupation } from '../types'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { hasNoUnusedFarmyardSpaces } from '../../game/farm'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E93_Motivator'

export const E93_Motivator = new Occupation({
  id: CARD_ID,
  name: 'Motivator',
  deck: 'E',
  number: 93,
  desc: ['On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply.'],
  cost: {},
  players: '1+',
})

export const E93_Motivator_impl = {
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

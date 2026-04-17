import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import { hasNoUnusedFarmyardSpaces } from '../../game/farm'

const CARD_ID = 'E93_Motivator'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (getRoundPlacementOrder(player).length !== 0) return
    if (!hasNoUnusedFarmyardSpaces(player)) return
    if (player.workersAvailable <= 0) return
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
})

export const E93_Motivator = new Occupation({
  id: CARD_ID,
  name: 'Motivator',
  deck: 'E',
  number: 93,
  desc: ['On your first turn each round, if you have no unused farmyard spaces, you can place a person from your supply.'],
  cost: {},
  players: '1+',
})

import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E86_PenBuilder'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const discards = player.cardStates?.[CARD_ID]?.counters?.discards ?? 0
    if (discards <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: discards * 2,
      animalType: null,
      animalCount: 0,
    })
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'E86-pen-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.resources.wood < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
          {
            type: 'leaf',
            actionId: 'store-on-card',
            params: { discards: 1 },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E86_PenBuilder.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const E86_PenBuilder = new Occupation({
  id: CARD_ID,
  name: 'Pen Builder',
  deck: 'E',
  number: 86,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['At any time, you can discard 1 <WOOD> from your supply. This card can hold two animals of any type for each <WOOD> discarded this way.'],
  cost: {},
  players: '1+',
})

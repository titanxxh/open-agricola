import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E086_PenBuilder'
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
      labelKey: 'cards.E086_PenBuilder.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones, _state) => {
    const discards = player.cardStates?.[CARD_ID]?.counters?.discards ?? 0
    if (discards <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      capacity: discards * 2,
      animalType: null,
      animalCount: 0,
      allowedAnimalType: null,
    })
  },
  /**
   * BGA `Cards/E/E086_PenBuilder.php::getInvalidAnimals` returns []:
   * capacity dynamically reflects discards * 2 via onPlayerComputeDropZones.
   * Mirror BGA exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E086_PenBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pen Builder',
    deck: 'E',
    number: 86,
    category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
    desc: ['At any time, you can discard 1 <WOOD> from your supply. This card can hold two animals of any type for each <WOOD> discarded this way.'],
    cost: {},
    animalHolder: true,
    players: '1+',
  },
  impl: cardImpl,
})

export const E086_PenBuilder_impl = E086_PenBuilder.impl

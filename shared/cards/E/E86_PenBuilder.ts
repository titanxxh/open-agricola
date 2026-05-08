import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E86_PenBuilder } from '../../cards-display/E/E86_PenBuilder'
export { E86_PenBuilder }

const CARD_ID = E86_PenBuilder.id

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

export const E86_PenBuilder_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    const discards = player.cardStates?.[CARD_ID]?.counters?.discards ?? 0
    if (discards <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      capacity: discards * 2,
      animalType: null,
      animalCount: 0,
    })
  },
  /**
   * BGA `Cards/E/E86_PenBuilder.php::getInvalidAnimals` returns []:
   * capacity dynamically reflects discards * 2 via onPlayerComputeDropZones.
   * Mirror BGA exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

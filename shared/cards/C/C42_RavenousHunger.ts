import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isCardFlagged } from '../helpers/card-state'
import type { ActionFlow, Resource } from '../../game/types'
import { workersAvailable } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C42_RavenousHunger'

/**
 * C42 Ravenous Hunger:
 * Immediately after each time you use Vegetable Seeds, you can place another person
 * on an accumulation space and get 1 additional good of the accumulating type.
 *
 * BGA: After Vegetable Seeds -> flag card -> place farmer on accumulation space ->
 * unflag card. On collect (while flagged) -> gain 1 extra of each accumulating type.
 *
 * Implementation:
 * 1. After place-farmer on vegetable-seeds: flag card, offer place-farmer (any space),
 *    then unflag. Note: BGA constrains to accumulation spaces only, but our
 *    place-farmer action does not support constraints; the collect bonus is still
 *    correctly gated to accumulation spaces via gainPerRound check.
 * 2. After collect: if flagged, gain 1 extra of each accumulating resource type.
 */
const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C42-ravenous-hunger-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'vegetable-seeds') return
    if (workersAvailable(context.state, context.player) <= 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID },
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

const afterCollectListener: CardListenerRegistration = {
  id: 'C42-ravenous-hunger-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return

    // Gain 1 additional good of each accumulating type from the space
    const gainPerRound = context.space?.gainPerRound
    if (!gainPerRound) return

    const gain: Partial<Resource> = {}
    for (const [key, value] of Object.entries(gainPerRound)) {
      if ((value ?? 0) > 0) {
        gain[key as keyof Resource] = 1
      }
    }
    if (Object.keys(gain).length === 0) return
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const C42_RavenousHunger = new MinorImprovement({
  id: CARD_ID,
  name: 'Ravenous Hunger',
  deck: 'C',
  number: 42,
  category: 'GOODS_PROVIDER',
  desc: [
    'Immediately after each time you use the __Vegetable Seeds__ action space, you can place another person on an accumulation space and get 1 additional good of the accumulating type.',
  ],
  cost: { grain: 1 },
  players: '1+',
})

export const C42_RavenousHunger_impl = {
  listeners: [afterPlaceFarmerListener, afterCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

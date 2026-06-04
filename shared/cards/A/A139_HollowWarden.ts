import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A139_HollowWarden'
/**
 * A139 Hollow Warden:
 * When you play this card, you immediately get a Major Improvement action to build a Fireplace.
 * Each time you use the Hollow accumulation space, you also get 1 Food.
 *
 * BGA: onBuy → optional improvement action for fireplaces (Major_Fireplace1, Major_Fireplace2,
 *      A60_OrientalFireplace). isListeningTo → isActionCardEvent(Hollow).
 *      onPlayerPlaceFarmer → gain 1 food.
 *
 * Occupation onBuy flows must use a occupation listener (engine does not
 * process onBuy flows for occupations — only for improvements).
 */
const FIREPLACE_IDS = ['Major_Fireplace1', 'Major_Fireplace2', 'A60_OrientalFireplace']

const onBuyListener: CardListenerRegistration = {
  id: 'A139-hollow-warden-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: FIREPLACE_IDS,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const HOLLOW_SPACES = new Set(['hollow', 'hollow-4'])

const hollowListener: CardListenerRegistration = {
  id: 'A139-hollow-warden-after-hollow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!HOLLOW_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [onBuyListener, hollowListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A139_HollowWarden = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Hollow Warden',
    deck: 'A',
    number: 139,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get a __Major Improvement__ action to build a Fireplace. Each time you use the __Hollow__ accumulation space, you also get 1 <FOOD>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A139_HollowWarden_impl = A139_HollowWarden.impl

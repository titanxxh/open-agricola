import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D114_SeedTrader'
/**
 * D114 Seed Trader (Sprint 7a F5+F6).
 *
 * BGA `Cards/D/D114_SeedTrader.php`:
 *   onBuy: createResourceInLocation cardId for [GRAIN, GRAIN, VEG, VEG]
 *   isListeningTo: isAnytime && resources-on-card non-empty
 *   onPlayerAtAnytime: XOR (PAY food:2 → take 1 grain from card) | (PAY food:3 → take 1 veg from card)
 *
 * We mirror via card-stored counters (grain/vegetable on cardStates), with anytime
 * emitting an XOR over (pay 2 food → take-from-card grain:1) and (pay 3 food →
 * take-from-card vegetable:1). No once-per-round limit (BGA has none).
 */
const anytimeListener: CardListenerRegistration = {
  id: 'D114-seed-trader-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const counters = context.player.cardStates?.[CARD_ID]?.counters ?? {}
    const grainOnCard = counters.grain ?? 0
    const vegOnCard = counters.vegetable ?? 0
    if (grainOnCard <= 0 && vegOnCard <= 0) return

    const food = context.player.resources.food ?? 0
    const branches: ActionFlow[] = []
    if (grainOnCard > 0 && food >= 2) {
      branches.push({
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          {
            type: 'leaf',
            actionId: 'take-from-card',
            sourceCard: CARD_ID,
            params: { grain: 1 },
          },
        ],
      })
    }
    if (vegOnCard > 0 && food >= 3) {
      branches.push({
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
          {
            type: 'leaf',
            actionId: 'take-from-card',
            sourceCard: CARD_ID,
            params: { vegetable: 1 },
          },
        ],
      })
    }
    if (branches.length === 0) return

    const flow: ActionFlow =
      branches.length === 1
        ? branches[0]!
        : { type: 'xor', children: branches }
    return {
      flow,
      sourceCard: CARD_ID,
      labelKey: 'cards.D114_SeedTrader.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    onBuy: (): ActionFlow => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { grain: 2, vegetable: 2 },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D114_SeedTrader = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Seed Trader',
    deck: 'D',
    number: 114,
    category: 'CROP_PROVIDER',
    desc: [
        'Place 2 <GRAIN> and 2 <VEGETABLE> on this card. You can buy them at any time. Each <GRAIN> costs 2 <FOOD>; each <VEGETABLE> costs 3 <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D114_SeedTrader_impl = D114_SeedTrader.impl

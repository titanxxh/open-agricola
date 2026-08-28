import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'
import { isUnconditionalSow } from '../../actions/effects/sow'

const CARD_ID = 'B054_Tumbrel'
/**
 * B54 Tumbrel (Minor Improvement):
 * When you play this card, you immediately get 2 Food.
 * Each time after you take an unconditional Sow action,
 * you get 1 Food for each stable you have.
 */

const listener: CardListenerRegistration = {
  id: 'B54-tumbrel-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
    const stableCount = getStableCountForCards(context.player)
    if (stableCount <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: stableCount }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B054_Tumbrel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Tumbrel',
    deck: 'B',
    number: 54,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 2 <FOOD>. Each time after you take an unconditional __Sow__ action, you get 1 <FOOD> for each <STABLE> you have.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B054_Tumbrel_impl = B054_Tumbrel.impl

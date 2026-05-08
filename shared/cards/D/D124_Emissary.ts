import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D124_Emissary } from '../../cards-display/D/D124_Emissary'
export { D124_Emissary }

const CARD_ID = D124_Emissary.id

const GOOD_TYPES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const

const listeners: CardListenerRegistration[] = GOOD_TYPES.map((good) => ({
  id: `D124-emissary-${good}`,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placed = getCardStack(context.player, CARD_ID)
    if (placed.includes(good)) return
    if ((context.player.resources[good as keyof typeof context.player.resources] ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [good]: 1 } }),
          gainLeaf(CARD_ID, { stone: 1 }),
          { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: good } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D124_Emissary.anytime',
      labelParams: { good },
    }
  },
}))

export const D124_Emissary_impl = {
  listeners,
  reaches: [] as readonly string[],
} satisfies CardImpl

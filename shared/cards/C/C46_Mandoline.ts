import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C46_Mandoline'

const anytimeListener: CardListenerRegistration = {
  id: 'C46-mandoline-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.vegetable < 1) return

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: context.player.id,
            startRound: context.state.round + 1,
            count: 2,
            resources: { food: 1 },
          }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C46_Mandoline.anytime',
    }
  },
}

export const C46_Mandoline = new MinorImprovement({
  id: CARD_ID,
  name: 'Mandoline',
  deck: 'C',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <VEGETABLE> to get 1 bonus <SCORE>. If you do, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
})

export const C46_Mandoline_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

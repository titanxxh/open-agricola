import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C046_Mandoline'
const anytimeListener: CardListenerRegistration = {
  id: 'C46-mandoline-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C046_Mandoline.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C046_Mandoline = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mandoline',
    deck: 'C',
    number: 46,
    category: 'FOOD_PROVIDER',
    desc: ['Once per round, you can pay 1 <VEGETABLE> to get 1 bonus <SCORE>. If you do, place 1 <FOOD> on each of the next 2 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1 },
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const C046_Mandoline_impl = C046_Mandoline.impl

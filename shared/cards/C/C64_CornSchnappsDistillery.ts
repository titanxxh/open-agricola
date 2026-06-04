import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C64_CornSchnappsDistillery'
const anytimeListener: CardListenerRegistration = {
  id: 'C64-corn-schnapps-distillery-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 1) return

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: context.player.id,
            startRound: context.state.round + 1,
            count: 4,
            resources: { food: 1 },
          }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C64_CornSchnappsDistillery.anytime',
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

export const C64_CornSchnappsDistillery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Corn Schnapps Distillery',
    deck: 'C',
    number: 64,
    category: 'FOOD_PROVIDER',
    desc: ['Once per round, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.'],
    cost: { wood: 1, clay: 2 },
    vp: 1,
  },
  impl: cardImpl,
})

export const C64_CornSchnappsDistillery_impl = C64_CornSchnappsDistillery.impl

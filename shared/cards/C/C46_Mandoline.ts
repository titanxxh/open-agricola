import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C46_Mandoline'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

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

registerCardListener(anytimeListener)

export const C46_Mandoline = new MinorImprovement({
  id: CARD_ID,
  name: 'Mandoline',
  deck: 'C',
  number: 46,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <VEGETABLE> to get 1 bonus point. If you do, place 1 <FOOD> on each of the next 2 round spaces.'],
  cost: { wood: 1 },
})

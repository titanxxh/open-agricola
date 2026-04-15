import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C64_CornSchnappsDistillery'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

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
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C64_CornSchnappsDistillery.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C64_CornSchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: 'Corn Schnapps Distillery',
  deck: 'C',
  number: 64,
  category: 'FOOD_PROVIDER',
  desc: ['Once per round, you can pay 1 <GRAIN> to place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the food.'],
  cost: { wood: 1, clay: 2 },
  vp: 1,
})

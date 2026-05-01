import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode, removeFutureMeeples } from '../../actions/effects/internal/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'B76_Ceilings'

const listener: CardListenerRegistration = {
  id: 'B76-ceilings-after-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    removeFutureMeeples(context.state, {
      playerId: context.player.id,
      cardId: CARD_ID,
    })
    setCardFlag(context.player, CARD_ID, true)
  },
}

export const B76_Ceilings = new MinorImprovement({
  id: CARD_ID,
  name: "Ceilings",
  deck: "B",
  number: 76,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on the next 5 round spaces. At the start of these rounds, you get the <WOOD>. Remove the <WOOD> promised by this card from future round spaces the next time you renovate."],
  cost: {"clay": 1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min": 1},
  implemented: true,
})

export const B76_Ceilings_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { wood: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

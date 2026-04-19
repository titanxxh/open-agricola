import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../game/types'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D55_NewMarket'

const getOpenRound = (state: GameState, spaceId: string) => {
  const roundIndex = state.roundActionOrder.findIndex((id) => id === spaceId)
  return roundIndex === -1 ? -1 : roundIndex + 1
}

const listener: CardListenerRegistration = {
  id: 'D55-new-market-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const openRound = getOpenRound(context.state, spaceId)
    if (openRound < 8 || openRound > 11) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D55_NewMarket = new MinorImprovement({
  id: CARD_ID,
  name: "New Market",
  deck: "D",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time you use an action space card on round spaces 8 to 11, you get 1 additional <FOOD>."],
  cost: { wood: 1, clay: 1 },
  vp: 1,
  newSet: true,
})

import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D055_NewMarket'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D055_NewMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "New Market",
    deck: "D",
    number: 55,
    category: "FOOD_PROVIDER",
    desc: ["Each time you use an action space card on round spaces 8 to 11, you get 1 additional <FOOD>."],
    cost: { wood: 1, clay: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const D055_NewMarket_impl = D055_NewMarket.impl

import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D55_NewMarket } from '../../cards-display/D/D55_NewMarket'

const CARD_ID = D55_NewMarket.id

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

export const D55_NewMarket_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { isMeepleSymbolSpaceId } from '../helpers/action-space-categories'
import { storedFoodCashoutListener, storeFoodOnCardFlow } from '../helpers/stored-food-cashout'

const CARD_ID = 'B173_Sweeper'

const afterMeepleSpaceListener: CardListenerRegistration = {
  id: 'B173-sweeper-after-meeple-space',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isMeepleSymbolSpaceId(context.space?.id)) return
    const flow = storeFoodOnCardFlow(context.player, CARD_ID)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [
    afterMeepleSpaceListener,
    storedFoodCashoutListener(CARD_ID, 'B173-sweeper-cashout'),
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B173_Sweeper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sweeper',
    deck: 'B',
    number: 173,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use an action space with the (meeple) symbol, place 1 <FOOD> on this card. Once this game, you can turn this card face down to get the <FOOD> on it.'],
    cost: {},
    players: '5+',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const B173_Sweeper_impl = B173_Sweeper.impl

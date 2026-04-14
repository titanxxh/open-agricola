import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B87_Cottager'

const listener: CardListenerRegistration = {
  id: 'B87-cottager-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'day-laborer') return
    const children: ActionFlow[] = [
      { type: 'leaf', actionId: 'construct', optional: false, sourceCard: CARD_ID, actionContext: { max: 1, trueAction: false } },
      { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID, actionContext: { trueAction: false } },
    ]
    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B87_Cottager = new Occupation({
  id: CARD_ID,
  name: 'Cottager',
  deck: 'B',
  number: 87,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Day Laborer__ action space, you can also either build exactly 1 room or renovate your house. Either way, you have to pay the cost.'],
  cost: {},
  players: '1+',
})

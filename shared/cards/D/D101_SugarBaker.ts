import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D101_SugarBaker'

// After Grain Utilization: optional pay 1 food → buy 1 bonus score.
// (Food goes on the action space for the next visitor — simplified: food is just spent.)
const listener: CardListenerRegistration = {
  id: 'D101-sugar-baker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { score: 1 },
    })
  },
}

export const D101_SugarBaker = new Occupation({
  id: CARD_ID,
  name: 'Sugar Baker',
  deck: 'D',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Each time after you use the __Grain Utilization__ action space, you can buy 1 bonus <SCORE> for 1 <FOOD>. Place the <FOOD> on the action space (for the next visitor).'],
  cost: {},
  players: '1+',
})

export const D101_SugarBaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

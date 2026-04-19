import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import { getFenceCount, maxFences } from '../../actions/effects/fencing'

const CARD_ID = 'A34_Loppers'

// A34 Loppers: Each time you build 1 or more fences, you can use this card to exchange
// 1 wood and 1 fence from your supply for 2 food and 1 bonus score.
// Note: 'fence' is not a Resource in our system. We check player.fences < maxFences to ensure
// a fence token is available, but do not decrement fence supply separately. The score is correct.
const listener: CardListenerRegistration = {
  id: 'A34-loppers-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getFenceCount(context.player) >= maxFences) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

registerCardListener(listener)

export const A34_Loppers = new MinorImprovement({
  id: CARD_ID,
  name: 'Loppers',
  deck: 'A',
  number: 34,
  category: 'POINTS_PROVIDER',
  desc: ['Each time you build 1 or more fences, you can also use this card to exchange 1 <WOOD> and 1 <FENCE> in your supply for 2 <FOOD> and 1 bonus <SCORE>.'],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})

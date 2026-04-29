import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E108_BlackberryFarmer'

// E108 Blackberry Farmer: Each time you build fences, place 1 FOOD on each remaining round space,
// up to the number of fences just built. At the start of these rounds, you get the FOOD.
const listener: CardListenerRegistration = {
  id: 'E108-blackberry-farmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Count fences built from the farm-choice `fence` extraData.
    // Palisades are tracked separately under `newPalisadeEdges` and must NOT
    // contribute to future-meeples for this card.
    const fencesBuilt =
      context.result?.type === 'ok'
        ? ((context.result.extraData?.newFenceEdges as string[] | undefined)?.length ?? 0)
        : 0
    if (fencesBuilt <= 0) return
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: fencesBuilt,
      resources: { food: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      sourceCard: CARD_ID,
    }
  },
}

export const E108_BlackberryFarmer = new Occupation({
  id: CARD_ID,
  name: 'Blackberry Farmer',
  deck: 'E',
  number: 108,
  category: 'FOOD',
  desc: [
    'Each time you build fences, place 1 <FOOD> on each remaining round space, up to the number of fences just built. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const E108_BlackberryFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

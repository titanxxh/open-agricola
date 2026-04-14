import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E108_BlackberryFarmer'

// E108 Blackberry Farmer: Each time you build fences, place 1 FOOD on each remaining round space,
// up to the number of fences just built. At the start of these rounds, you get the FOOD.
const listener: CardListenerRegistration = {
  id: 'E108-blackberry-farmer-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const newPastures =
      context.result?.type === 'ok'
        ? (context.result.extraData?.newPastures as { tiles?: unknown[] }[] | undefined)
        : undefined
    if (!newPastures || newPastures.length === 0) return
    // Count fences built: each new pasture contributes fenceCost fences
    // We approximate by using player.fences delta - BGA uses count of actual fence segments built
    // Use fencesBuilt from extraData if available, else approximate via pastures
    const fencesBuilt =
      (context.result?.type === 'ok'
        ? (context.result.extraData?.fencesBuilt as number | undefined)
        : undefined) ?? newPastures.length
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

registerCardListener(listener)

export const E108_BlackberryFarmer = new Occupation({
  id: CARD_ID,
  name: 'Blackberry Farmer',
  deck: 'E',
  number: 108,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build fences, place 1 <FOOD> on each remaining round space, up to the number of fences just built. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})

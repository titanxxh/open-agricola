import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter, initCardState } from '../__stubs__/helpers'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'A74_StableTree'

const listener: CardListenerRegistration = {
  id: 'A74-stable-tree-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    const usedRound = counters['usedRound'] ?? 0
    if (usedRound === context.state.round) return
    counters['usedRound'] = context.state.round
    incCounter(context.player, CARD_ID, 'triggerCount')
    queueFutureMeeples(context.state, {
      cardId: CARD_ID,
      playerId: context.player.id,
      startRound: context.state.round + 1,
      count: 3,
      resources: { wood: 1 },
    })
    return {
      flow: futureMeeplesNode(),
      logKey: 'log.cardEffectGain',
      logParams: { cardId: CARD_ID, gain: 'futureMeeples: 3x1 WOOD' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A74_StableTree = new MinorImprovement({
  id: CARD_ID,
  name: "Stable Tree",
  deck: "A",
  number: 74,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build 1 or more stables on your turn, place 1 <WOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <WOOD>."],
  cost: {"wood":1},
})

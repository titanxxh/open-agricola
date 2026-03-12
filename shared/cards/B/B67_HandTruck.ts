import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B67_HandTruck'

const listener: CardListenerRegistration = {
  id: 'B67-hand-truck-before-bake',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const accumulationSpaces = context.state.actionSpaces.filter(
      (space) =>
        space.takenBy === context.player.id &&
        Object.values(space.gainPerRound).some(
          (value) => typeof value === 'number' && value > 0,
        ),
    )
    const workerCount = accumulationSpaces.length
    if (workerCount <= 0) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { grain: workerCount } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { grain: workerCount }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const B67_HandTruck = new MinorImprovement({
  id: CARD_ID,
  name: "Hand Truck",
  deck: "B",
  number: 67,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take a __Bake Bread__ action, you also get 1 <GRAIN> for each of your people occupying an accumulation space."],
  cost: {"wood":1},
  newSet: true,
})

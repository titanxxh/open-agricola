import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState, incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A83_ShepherdsCrook'
const MIN_PASTURE_SIZE = 4

const listener: CardListenerRegistration = {
  id: 'A83-shepherds-crook-after-fencing',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    const previousBigPastures = counters['processedBigPastures'] ?? 0
    const currentBigPastures = context.player.pastures.filter(
      (p) => (p.spaces?.length ?? 0) >= MIN_PASTURE_SIZE,
    ).length
    const newBig = currentBigPastures - previousBigPastures
    if (newBig <= 0) return
    counters['processedBigPastures'] = currentBigPastures
    incCounter(context.player, CARD_ID, 'triggerCount')
    const sheepGain = newBig * 2
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { sheep: sheepGain } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { sheep: sheepGain }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A83_ShepherdsCrook = new MinorImprovement({
  id: CARD_ID,
  name: "Shepherd's Crook",
  deck: "A",
  number: 83,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Each time you fence a new pasture covering at least 4 farmyard spaces, you immediately get 2 sheep on this pasture."],
  cost: {"wood":1},
})

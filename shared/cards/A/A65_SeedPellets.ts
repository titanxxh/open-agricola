import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A65_SeedPellets'

const listener: CardListenerRegistration = {
  id: 'A65-seed-pellets-before-sow',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { grain: 1 } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { grain: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A65_SeedPellets = new MinorImprovement({
  id: CARD_ID,
  name: "Seed Pellets",
  deck: "A",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take an unconditional __Sow__ action, you get 1 <GRAIN>."],
  cost: {},
  prerequisite: "3 Fields",
})

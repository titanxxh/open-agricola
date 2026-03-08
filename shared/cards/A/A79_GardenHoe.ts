import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A79_GardenHoe'

const listener: CardListenerRegistration = {
  id: 'A79-garden-hoe-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const hasVegetable = context.player.fields.some(
      (f) => f.crop === 'vegetable' && f.amount > 0,
    )
    if (!hasVegetable) return
    incCounter(context.player, CARD_ID, 'triggerCount')
    return {
      flow: { type: 'leaf', actionId: 'gain', params: { clay: 1, stone: 1 } },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { clay: 1, stone: 1 }, cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A79_GardenHoe = new MinorImprovement({
  id: CARD_ID,
  name: "Garden Hoe",
  deck: "A",
  number: 79,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you take an unconditional __Sow__ action planting <VEGETABLE> in at least 1 field, you get 1 <CLAY> and 1 <STONE>."],
  cost: {"wood":1},
  newSet: true,
})

import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard'
import type { CardImpl } from '../registry'

const CARD_ID = 'M058_PeatFertilizer'

const canSow = (context: CardListenerContext) => {
  if (context.player.fields.length < 2) return false
  const farm = buildSowFarmInteraction(context.player)
  return farm.farmType === 'sow' && farm.selectableFields.length > 0
}

const listener: CardListenerRegistration = {
  id: 'M058-peat-fertilizer-after-cut-peat',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['cut-peat'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canSow(context)) return
    return {
      flow: { type: 'leaf', actionId: 'sow', optional: true, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => player.fields.length >= 2,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M058_PeatFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Fertilizer",
    deck: "M",
    number: 58,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take the __Cut Peat__ special action, you can also take a __Sow__ action."
    ],
    cost: {},
    prerequisite: "2 Fields",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M058_PeatFertilizer_impl = M058_PeatFertilizer.impl

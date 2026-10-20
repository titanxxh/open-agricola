import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard-interaction'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M060_SowingMachine'

const canSow = (context: CardListenerContext) => {
  if ((context.player.resources.horse ?? 0) < 2) return false
  const farm = buildSowFarmInteraction(context.player)
  return farm.farmType === 'sow' && farm.selectableFields.length > 0
}

const sowFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'sow',
  optional: true,
  sourceCard: CARD_ID,
})

const listener: CardListenerRegistration = {
  id: 'M060-sowing-machine-after-special-action',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['moor-action'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canSow(context)) return
    return {
      flow: sowFlow(),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => (player.resources.horse ?? 0) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M060_SowingMachine = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Sowing Machine",
    deck: "M",
    number: 60,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take a special action, if you then have at least 2 <HORSE>, you can also take a __Sow__ action."
    ],
    cost: {
        "wood": 3
    },
    prerequisite: "1 Horse",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M060_SowingMachine_impl = M060_SowingMachine.impl

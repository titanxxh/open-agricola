import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldTotalRemaining } from '../../game/field'

const CARD_ID = 'A79_GardenHoe'

const listener: CardListenerRegistration = {
  id: 'A79-garden-hoe-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const actionContext = context.actionContext ?? {}
    if (actionContext.checkedReplaceAction === true) return
    if (actionContext.maxSelections !== undefined || actionContext.cropType !== undefined) return
    const hasVegetable = context.player.fields.some(
      (field) => {
        const legacyAmount = (field as unknown as { amount?: number }).amount ?? 0
        return fieldHasCrop(field, 'vegetable') && (fieldTotalRemaining(field) > 0 || legacyAmount > 0)
      },
    )
    if (!hasVegetable) return
    return { flow: gainLeaf(CARD_ID, { clay: 1, stone: 1 }), sourceCard: CARD_ID }
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

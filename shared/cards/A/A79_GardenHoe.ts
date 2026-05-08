import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldTotalRemaining } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A79_GardenHoe } from '../../cards-display/A/A79_GardenHoe'
export { A79_GardenHoe }

const CARD_ID = A79_GardenHoe.id

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
      (field) => fieldHasCrop(field, 'vegetable') && fieldTotalRemaining(field) > 0,
    )
    if (!hasVegetable) return
    return { flow: gainLeaf(CARD_ID, { clay: 1, stone: 1 }), sourceCard: CARD_ID }
  },
}

export const A79_GardenHoe_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D58_Gritter } from '../../cards-display/D/D58_Gritter'
export { D58_Gritter }

const CARD_ID = D58_Gritter.id

registerPrerequisite('Play in Round 5 or Later', (_player, state) => {
  if (!state) return true
  return state.round >= 5
})

const listener: CardListenerRegistration = {
  id: 'D58-gritter-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check if any vegetable was sown (any field has vegetable crop)
    const vegetableFields = context.player.fields.filter((f) => fieldHasCrop(f, 'vegetable'))
    // We compare to the last result to detect if vegetable was just sown
    // Since sow doesn't return resource gained info, check if a vegetable field exists
    const n = vegetableFields.length
    if (n <= 0) return
    // Only trigger if a vegetable was actually sown this action
    // We detect by checking if any field was just seeded (remaining > 0 indicates sowing happened)
    // BGA: only triggers if at least one vegetable was sown this action
    // We approximate: trigger only when we can confirm vegetable was sown
    // Use the last-sown detection: check if any vegetable field has remaining crops
    const justSowed = vegetableFields.some((f) => (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0) > 0)
    if (!justSowed) return
    return { flow: gainLeaf(CARD_ID, { food: n }), sourceCard: CARD_ID }
  },
}

export const D58_Gritter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

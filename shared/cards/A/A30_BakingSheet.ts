import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A30_BakingSheet } from '../../cards-display/A/A30_BakingSheet'
export { A30_BakingSheet }

const CARD_ID = A30_BakingSheet.id

registerPrerequisite('No Grain Field', (player) =>
  player.fields.every((f) => !fieldHasCrop(f, 'grain')),
)

const listener: CardListenerRegistration = {
  id: 'A30-baking-sheet-after-bake',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return payGainNode({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

export const A30_BakingSheet_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

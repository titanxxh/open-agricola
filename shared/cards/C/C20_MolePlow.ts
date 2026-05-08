import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { C20_MolePlow } from '../../cards-display/C/C20_MolePlow'
export { C20_MolePlow }

const CARD_ID = C20_MolePlow.id

registerPrerequisite('Play in Round 9 or Later', (_player, state) => {
  if (!state) return true
  return state.round >= 9
})

const listener: CardListenerRegistration = {
  id: 'C20-mole-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'farmland' && id !== 'cultivation') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'plow',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C20_MolePlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

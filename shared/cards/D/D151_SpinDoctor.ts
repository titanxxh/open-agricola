import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D151_SpinDoctor } from '../../cards-display/D/D151_SpinDoctor'
export { D151_SpinDoctor }

const CARD_ID = D151_SpinDoctor.id

const listener: CardListenerRegistration = {
  id: 'D151-spin-doctor-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    if (workersAvailable(context.state, context.player) <= 0) return
    // Collect all visible action spaces except Meeting Place
    const addedSpaces = context.state.actionSpaces
      .filter((s) => s.id !== 'meeting-place' && context.state.round >= (s.roundAvailable ?? 1))
      .map((s) => s.id)
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'place-farmer',
            optional: true,
            sourceCard: CARD_ID,
            params: { allowOccupied: true, added: addedSpaces },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D151_SpinDoctor_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

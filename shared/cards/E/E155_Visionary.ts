import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../domain/player'
import { E155_Visionary } from '../../cards-display/E/E155_Visionary'
export { E155_Visionary }

const CARD_ID = E155_Visionary.id

const isDoableListener: CardListenerRegistration = {
  id: 'E155-visionary-isdoable-family-growth',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round >= 11) return
    const others = context.state.players.filter((p) => p.id !== context.player.id)
    const someoneNotGrown = others.some((p) => familySize(p) === 2)
    if (someoneNotGrown) return { doable: false }
  },
}

export const E155_Visionary_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      if (state.round <= 4) {
        return {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { stone: 1, vegetable: 1, boar: 2 },
        }
      }
    },
  },
  listeners: [isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

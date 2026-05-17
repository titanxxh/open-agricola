import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'
import { B157_Salter } from '../../cards-display/B/B157_Salter'

const CARD_ID = B157_Salter.id

const anytimeListener: CardListenerRegistration = {
  id: 'B157-salter-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player } = context
    const onBoard = getAssignedAnimalsByType(player)
    const totalOnBoard = onBoard.sheep + onBoard.boar + onBoard.cattle
    if (totalOnBoard < 1) return
    const reserveSum =
      (player.resources.sheep ?? 0) - onBoard.sheep +
      (player.resources.boar ?? 0) - onBoard.boar +
      (player.resources.cattle ?? 0) - onBoard.cattle
    if (reserveSum > 0) return
    if (state.round + 1 > 14) return

    let singleOnly: 'sheep' | 'boar' | 'cattle' | null = null
    if (onBoard.sheep === 1 && onBoard.boar === 0 && onBoard.cattle === 0) singleOnly = 'sheep'
    else if (onBoard.boar === 1 && onBoard.sheep === 0 && onBoard.cattle === 0) singleOnly = 'boar'
    else if (onBoard.cattle === 1 && onBoard.sheep === 0 && onBoard.boar === 0) singleOnly = 'cattle'

    if (singleOnly) {
      return {
        flow: {
          type: 'leaf',
          actionId: 'salter-pick',
          sourceCard: CARD_ID,
          params: { presetCounts: { [singleOnly]: 1 } },
        },
        sourceCard: CARD_ID,
        labelKey: `cards.B157_Salter.single.${singleOnly}`,
      }
    }
    return {
      flow: { type: 'leaf', actionId: 'salter-pick', sourceCard: CARD_ID },
      sourceCard: CARD_ID,
      labelKey: 'cards.B157_Salter.anytime',
    }
  },
}

export const B157_Salter_impl = {
  listeners: [anytimeListener],
  effect: { id: CARD_ID },
  reaches: [] as readonly string[],
} satisfies CardImpl

import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A124_Knapper } from '../../cards-display/A/A124_Knapper'

const CARD_ID = A124_Knapper.id

const isRound5to7ActionSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const roundOrder = context.state.roundActionOrder
  for (let i = 4; i <= 6; i += 1) {
    const spaceId = roundOrder[i]
    if (spaceId && spaceId === context.space.id) {
      return true
    }
  }
  return false
}

const listener: CardListenerRegistration = {
  id: 'A124-knapper-before-action',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return
    // Fire only for the top-level space action (actionId === spaceId), not
    // sub-actions (e.g., 'collect') triggered inside the space's flow.
    if (context.actionId !== context.space.id) return
    if (!isRound5to7ActionSpace(context)) return
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

export const A124_Knapper_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

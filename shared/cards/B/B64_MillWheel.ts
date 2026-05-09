import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B64_MillWheel } from '../../cards-display/B/B64_MillWheel'

const CARD_ID = B64_MillWheel.id

const listener: CardListenerRegistration = {
  id: 'B64-mill-wheel-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    const fishing = context.state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing || !isSpaceOccupied(fishing)) return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const B64_MillWheel_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

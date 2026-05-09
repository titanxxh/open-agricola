import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B62_Pitchfork } from '../../cards-display/B/B62_Pitchfork'

const CARD_ID = B62_Pitchfork.id

const listener: CardListenerRegistration = {
  id: 'B62-pitchfork-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    const farmland = context.state.actionSpaces.find((s) => s.id === 'farmland')
    if (!farmland || !isSpaceOccupied(farmland)) return
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

export const B62_Pitchfork_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

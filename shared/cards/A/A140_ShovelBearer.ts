import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A140_ShovelBearer } from '../../cards-display/A/A140_ShovelBearer'
export { A140_ShovelBearer }

const CARD_ID = A140_ShovelBearer.id

const listener: CardListenerRegistration = {
  id: 'A140-shovel-bearer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'clay-pit' && spaceId !== 'hollow-4') return
    // Get the OTHER clay space
    const otherSpaceId = spaceId === 'clay-pit' ? 'hollow-4' : 'clay-pit'
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace) return
    const clay = otherSpace.resources?.clay ?? 0
    if (clay <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: clay }), sourceCard: CARD_ID }
  },
}

export const A140_ShovelBearer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

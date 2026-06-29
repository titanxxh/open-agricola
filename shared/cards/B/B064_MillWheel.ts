import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B064_MillWheel'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B064_MillWheel = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mill Wheel',
    deck: 'B',
    number: 64,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you use the __Grain Utilization__ action space while the __Fishing__ accumulation space is occupied, you get an additional 2 <FOOD>.'],
    vp: 1,
    cost: { wood: 2 },
  },
  impl: cardImpl,
})

export const B064_MillWheel_impl = B064_MillWheel.impl

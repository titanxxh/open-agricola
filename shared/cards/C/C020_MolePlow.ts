import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C020_MolePlow'
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

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 9
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C020_MolePlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mole Plow',
    deck: 'C',
    number: 20,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can plow 1 additional field.'],
    cost: { wood: 3, food: 1 },
    prerequisite: 'Play in Round 9 or Later',
  },
  impl: cardImpl,
})

export const C020_MolePlow_impl = C020_MolePlow.impl

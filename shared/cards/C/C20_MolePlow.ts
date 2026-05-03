import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'C20_MolePlow'

// BGA isBuyable: turn < 9 → false
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

export const C20_MolePlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Mole Plow',
  deck: 'C',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ or __Cultivation__ action space, you can plow 1 additional field.'],
  cost: { wood: 3, food: 1 },
  prerequisite: 'Play in Round 9 or Later',
  newSet: true,
})

export const C20_MolePlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

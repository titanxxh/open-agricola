import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isSpaceOccupied } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B90_CooperativePlower'

const listener: CardListenerRegistration = {
  id: 'B90-cooperative-plower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland') return
    const grainSeeds = context.state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds || !isSpaceOccupied(grainSeeds)) return
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

export const B90_CooperativePlower = new Occupation({
  id: CARD_ID,
  name: 'Cooperative Plower',
  deck: 'B',
  number: 90,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Farmland__ action space while the __Grain Seeds__ action space is occupied, you can plow 1 additional field.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const B90_CooperativePlower_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

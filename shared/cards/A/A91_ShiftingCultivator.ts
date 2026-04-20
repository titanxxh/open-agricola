import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A91_ShiftingCultivator'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

// A91 Shifting Cultivator: Each time you use a wood accumulation space, you can also pay 3 FOOD
// to plow 1 field. Triggers before collecting (before the space resources are gained).
const listener: CardListenerRegistration = {
  id: 'A91-shifting-cultivator-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A91_ShiftingCultivator = new Occupation({
  id: CARD_ID,
  name: 'Shifting Cultivator',
  deck: 'A',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use a wood accumulation space, you can also pay 3 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const A91_ShiftingCultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

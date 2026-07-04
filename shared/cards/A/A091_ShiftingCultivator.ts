import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A091_ShiftingCultivator'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A091_ShiftingCultivator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Shifting Cultivator',
    deck: 'A',
    number: 91,
    category: 'FARM_PLANNER',
    desc: ['Each time you use a <WOOD> accumulation space, you can also pay 3 <FOOD> to plow 1 <FIELD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A091_ShiftingCultivator_impl = A091_ShiftingCultivator.impl

import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E075_StoneAxe'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'E75-stone-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { stone: 1 } }),
          gainLeaf(CARD_ID, { wood: 3 }),
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

export const E075_StoneAxe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Axe",
    deck: "E",
    number: 75,
    desc: ["Each time you use a wood accumulation space, you can return 1 <STONE> to the general supply to get an additional 3 <WOOD>."],
    cost: { wood: 1, clay: 1 },
    vp: 1,
    prerequisite: "2 Occupations",
    occupationPrerequisites: { min: 2 },
    category: 'BUILDING_RESOURCES_-_WOOD',
  },
  impl: cardImpl,
})

export const E075_StoneAxe_impl = E075_StoneAxe.impl

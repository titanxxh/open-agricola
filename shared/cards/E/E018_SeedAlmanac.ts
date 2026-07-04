import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isMinorCardId } from '../helpers/card-type'

const CARD_ID = 'E018_SeedAlmanac'
const listener: CardListenerRegistration = {
  id: 'E18-seed-almanac-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || builtId === CARD_ID || !isMinorCardId(builtId)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
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

export const E018_SeedAlmanac = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Seed Almanac',
    deck: 'E',
    number: 18,
    category: 'FARMYARD_-_PLOWING',
    desc: [
        'Each time after you play a minor improvement after this one, you can pay 1 <FOOD> to plow 1 <FIELD>.',
      ],
    cost: { reed: 1 },
    prerequisite: '4 Occupations',
    occupationPrerequisites: { min: 4 },
  },
  impl: cardImpl,
})

export const E018_SeedAlmanac_impl = E018_SeedAlmanac.impl

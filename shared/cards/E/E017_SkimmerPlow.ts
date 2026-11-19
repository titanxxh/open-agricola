import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E017_SkimmerPlow'
const listener: CardListenerRegistration = {
  id: 'E17-skimmer-plow-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'farmland' && spaceId !== 'cultivation') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
    id: CARD_ID,
    // Each sown field gets one fewer good; the Sow amount floor keeps the seed.
    // Non-field crop spaces (M111) are not fields.
    modifySowAmount: ({ target }) => target.kind === 'extra' && !target.isField ? undefined : { delta: -1 },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E017_SkimmerPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Skimmer Plow',
    deck: 'E',
    number: 17,
    category: 'FARMYARD_-_PLOWING',
    desc: ['Each time you use the __Farmland__ or __Cultivation__  action space, you can plow 2 <FIELD> instead of 1. Each time you sow, you must place 1 fewer good on each <FIELD> you sow.'],
    cost: { wood: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const E017_SkimmerPlow_impl = E017_SkimmerPlow.impl

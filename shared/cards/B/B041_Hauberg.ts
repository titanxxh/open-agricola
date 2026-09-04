import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { ActionFlow, FutureMeepleResourceMap } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B041_Hauberg'

const orderingChoice = (
  playerId: string,
  baseRound: number,
  first: 'wood' | 'boar',
): ActionFlow => {
  const second = first === 'wood' ? 'boar' : 'wood'
  const resourceAt = (resource: 'wood' | 'boar'): FutureMeepleResourceMap =>
    resource === 'wood' ? { wood: 2 } : { boar: 1 }
  const sequence: ('wood' | 'boar')[] = [first, second, first, second]
  return {
    ...futureMeeplesNode({
      cardId: CARD_ID,
      playerId,
      entries: sequence.map((resource, index) => ({
        round: baseRound + index + 1,
        resources: resourceAt(resource),
      })),
    }),
    choiceLabelKey: `resources.${first}`,
    sourceCard: CARD_ID,
  }
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => ({
    type: 'xor',
    children: [
      orderingChoice(player.id, state.round, 'wood'),
      orderingChoice(player.id, state.round, 'boar'),
    ],
    sourceCard: CARD_ID,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B041_Hauberg = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hauberg',
    deck: 'B',
    number: 41,
    category: 'GOODS_PROVIDER',
    desc: ['Alternate placing 2 <WOOD> and 1 <PIG> on the next 4 round spaces. You decide what to start with. At the start of these rounds, you get the goods.'],
    cost: { food: 3 },
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const B041_Hauberg_impl = B041_Hauberg.impl

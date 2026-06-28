import { defineMinorCard } from '../card-source'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E020_IronHoe'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    const vegSeeds = state.actionSpaces.find((s) => s.id === 'vegetable-seeds')
    if (!grainSeeds || !vegSeeds) return
    if (!spaceHasPlayer(grainSeeds, player.id) || !spaceHasPlayer(vegSeeds, player.id)) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E020_IronHoe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Iron Hoe',
    deck: 'E',
    number: 20,
    category: 'FARMYARD_-_PLOWING',
    desc: ['At the end of each work phase, if you occupy both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you can plow 1 field.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E020_IronHoe_impl = E020_IronHoe.impl

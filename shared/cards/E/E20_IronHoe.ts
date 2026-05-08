import { MinorImprovement } from '../types'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'E20_IronHoe'

export const E20_IronHoe = new MinorImprovement({
  id: CARD_ID,
  name: 'Iron Hoe',
  deck: 'E',
  number: 20,
  category: 'FARMYARD_-_PLOWING',
  desc: ['At the end of each work phase, if you occupy both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you can plow 1 field.'],
  cost: { wood: 1 },
})

export const E20_IronHoe_impl = {
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

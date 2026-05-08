import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { E20_IronHoe } from '../../cards-display/E/E20_IronHoe'
export { E20_IronHoe }

const CARD_ID = E20_IronHoe.id

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

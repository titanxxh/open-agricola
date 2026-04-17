import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { spaceHasPlayer } from '../../game/space'

const CARD_ID = 'E20_IronHoe'

// E20 Iron Hoe: At the end of each work phase, if you occupy both the Grain Seeds and
// Vegetable Seeds action spaces, you can plow 1 field.
// BGA fires at StartReturnHome; we use onStartReturnHome.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
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
})

export const E20_IronHoe = new MinorImprovement({
  id: CARD_ID,
  name: 'Iron Hoe',
  deck: 'E',
  number: 20,
  category: 'FARMYARD_PLOWING',
  desc: ['At the end of each work phase, if you occupy both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you can plow 1 field.'],
  cost: { wood: 1 },
})

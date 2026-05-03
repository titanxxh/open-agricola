import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'B52_GrowingFarm'

// BGA isBuyable: countCoveredZonesByPastures < turn - 1 → false.
// "as many pasture spaces as completed rounds" — completed rounds == round - 1.
// Use a unique label (not the shared "see below" string D25 uses) so the
// registry handler does not collide with D25_WitchesDanceFloor (label-only prereq).
registerPrerequisite('Pasture Spaces >= Completed Rounds', (player, state) => {
  if (!state) return true
  const coveredZones = player.pastures.reduce((sum, p) => sum + p.tiles.length, 0)
  return coveredZones >= state.round - 1
})

export const B52_GrowingFarm = new MinorImprovement({
  id: CARD_ID,
  name: 'Growing Farm',
  deck: 'B',
  number: 52,
  category: 'FOOD_PROVIDER',
  desc: ['You can only play this card if you have at least as many pasture spaces as the number of completed rounds. If you do, you get a number of <FOOD> equal to the current round.'],
  cost: { clay: 2, reed: 1 },
  vp: 2,
  prerequisite: 'Pasture Spaces >= Completed Rounds',
})

export const B52_GrowingFarm_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const turn = state.round
    if (turn <= 0) return
    return gainLeaf(CARD_ID, { food: turn })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

import { MinorImprovement } from '../types'
import { recallWorkerById } from '../helpers/recall-worker'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E3_TeaTime'

// BGA isBuyable: Farmers::getOnCard('ActionGrainUtilization', $pid)->empty() → false
registerPrerequisite('Own Person on Grain Utilization', (player, state) => {
  if (!state) return true
  const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')
  if (!space) return false
  return space.takenBy.some((t) => t.playerId === player.id)
})

export const E3_TeaTime = new MinorImprovement({
  id: CARD_ID,
  name: 'Tea Time',
  deck: 'E',
  number: 3,
  category: 'PASSING_-_ACTION_-_FARMYARD',
  desc: ['Immediately return your person on the __Grain Utilization__ action space home; you can place it again later this round.'],
  cost: { food: 1 },
  passing: true,
  prerequisite: 'Own Person on Grain Utilization',
})

export const E3_TeaTime_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // BGA reads the actual occupancy on Grain Utilization (not round-placement
    // history). Grab whichever of this player's workers is sitting there and
    // recall it via the shared helper.
    const space = state.actionSpaces.find((s) => s.id === 'grain-utilization')
    const ref = space?.takenBy.find((t) => t.playerId === player.id)
    if (!ref) return
    recallWorkerById(state, player, ref.workerId)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

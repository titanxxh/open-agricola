import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { isBorderEdge } from '../../game/farm'
import { getAllEdgeIds } from '../../logic/farm/fence-validation'
import type { CardImpl } from '../registry'

const CARD_ID = 'E16_BriarHedge'
const countAllAnimalsOfType = (player: { resources: { sheep: number; boar: number; cattle: number }; pastures: Array<{ animalType: string | null; animalCount: number }>; houseAnimalType: string | null; houseAnimalCount: number; stableAnimals?: Record<string, string | null> }) => {
  const totals = { sheep: 0, boar: 0, cattle: 0 } as Record<string, number>
  for (const pasture of player.pastures) {
    if (pasture.animalType && pasture.animalCount > 0) {
      totals[pasture.animalType] = (totals[pasture.animalType] ?? 0) + pasture.animalCount
    }
  }
  if (player.houseAnimalType && player.houseAnimalCount > 0) {
    totals[player.houseAnimalType] = (totals[player.houseAnimalType] ?? 0) + player.houseAnimalCount
  }
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal) totals[animal] = (totals[animal] ?? 0) + 1
  }
  return totals
}

registerPrerequisite('1 Animal of Each Type', (player) => {
  const totals = countAllAnimalsOfType(player)
  return (totals.sheep ?? 0) >= 1 && (totals.boar ?? 0) >= 1 && (totals.cattle ?? 0) >= 1
})

export const E16_BriarHedge = new MinorImprovement({
  id: CARD_ID,
  name: 'Briar Hedge',
  deck: 'E',
  number: 16,
  desc: ['You do not need to pay wood for fences that you build on the edge of your farmyard board.'],
  cost: {},
  prerequisite: '1 Animal of Each Type',
})

const countAvailableBorderEdges = (player: { fenceSegments?: { edge: string }[] }): number => {
  const built = new Set((player.fenceSegments ?? []).map((s) => s.edge))
  let count = 0
  for (const edgeId of getAllEdgeIds()) {
    if (!isBorderEdge(edgeId)) continue
    if (built.has(edgeId)) continue
    count += 1
  }
  return count
}

export const E16_BriarHedge_impl = {
  effect: {
  id: CARD_ID,
  computeFenceDiscount: (_state, _player, ctx) => {
    return ctx.newFenceEdges.filter(isBorderEdge).length
  },
  computeFenceFreeAvailable: (_state, player) => countAvailableBorderEdges(player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

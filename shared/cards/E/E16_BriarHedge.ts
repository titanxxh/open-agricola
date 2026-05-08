import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { isBorderEdge } from '../../domain/farm'
import { getAllEdgeIds } from '../../domain'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { E16_BriarHedge } from '../../cards-display/E/E16_BriarHedge'

const CARD_ID = E16_BriarHedge.id

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

const E16FenceListener: CardListenerRegistration = {
  id: 'E16-fence-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    const params = ctx.params as { newFenceEdges?: string[] } | undefined
    const newFenceEdges = params?.newFenceEdges
    if (newFenceEdges === undefined) {
      const available = countAvailableBorderEdges(ctx.player)
      return { costs: { wood: available === 0 ? 0 : -available } }
    }
    const borderCount = newFenceEdges.filter(isBorderEdge).length
    return { costs: { wood: borderCount === 0 ? 0 : -borderCount } }
  },
}

export const E16_BriarHedge_impl = {
  listeners: [E16FenceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

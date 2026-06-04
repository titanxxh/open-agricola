import { isBorderEdge } from '../../domain/farm'
import { getAllEdgeIds } from '../../domain'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { E16_BriarHedge } from '../../cards-display/E/E16_BriarHedge'

const CARD_ID = E16_BriarHedge.id

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
  prerequisiteCheck: (player) => {
    const totals = getAssignedAnimalsByType(player)
    return totals.sheep >= 1 && totals.boar >= 1 && totals.cattle >= 1
  },
  listeners: [E16FenceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

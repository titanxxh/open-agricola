import { defineMinorCard } from '../card-source'
import { getFarmyardEdgeIds, isFarmyardBorderEdge } from '../../domain/farm'
import { resolveBuildPlayers } from '../../actions/helpers/build-players'
import { getAssignedAnimalsByType } from '../../domain/animals'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E016_BriarHedge'
const countAvailableBorderEdges = (player: CardListenerContext['player']): number => {
  const built = new Set((player.fenceSegments ?? []).map((s) => s.edge))
  let count = 0
  for (const edgeId of getFarmyardEdgeIds(player)) {
    if (!isFarmyardBorderEdge(player, edgeId)) continue
    if (built.has(edgeId)) continue
    count += 1
  }
  return count
}

const E16FenceListener: CardListenerRegistration = {
  id: 'E16-fence-discount',
  monotoneFenceCost: true,
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    const farm = resolveBuildPlayers(ctx)?.farmOwner
    if (!farm) return
    const params = ctx.params as { newFenceEdges?: string[] } | undefined
    const newFenceEdges = params?.newFenceEdges
    if (newFenceEdges === undefined) {
      const available = countAvailableBorderEdges(farm)
      const costs = { wood: available === 0 ? 0 : -available }
      return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
    }
    const borderCount = newFenceEdges.filter(edge => isFarmyardBorderEdge(farm, edge)).length
    const costs = { wood: borderCount === 0 ? 0 : -borderCount }
    return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
  },
}

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    const totals = getAssignedAnimalsByType(player, state)
    return totals.sheep >= 1 && totals.boar >= 1 && totals.cattle >= 1
  },
  listeners: [E16FenceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E016_BriarHedge = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Briar Hedge',
    deck: 'E',
    number: 16,
    desc: ['You do not need to pay <WOOD> for <FENCE> that you build on the edge of your farmyard board.'],
    cost: {},
    prerequisite: '1 Animal of Each Type',
    category: 'FARMYARD_-__FENCING_OR_STABLE_BUILDING',
  },
  impl: cardImpl,
})

export const E016_BriarHedge_impl = E016_BriarHedge.impl

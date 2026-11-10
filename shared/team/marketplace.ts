import type { GameState, PlayerState, Resource } from '../contract/types'
import { readMarketplaceTransfers, type MarketplaceGood, type MarketplaceRequest, type MarketplaceTransfer } from '../contract/marketplace'

const SUPPLY_GOODS = ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable', 'food'] as const
export const marketplaceGoods = (state: GameState): MarketplaceGood[] => [
  ...SUPPLY_GOODS, ...(state.enableFarmersOfTheMoor ? ['fuel' as const] : []),
]

export function marketplaceTeammates(state: GameState, player: PlayerState): PlayerState[] {
  const team = state.team
  if (team?.configuration.cooperationRules !== true || ![4, 6].includes(state.players.length)) return []
  const index = state.players.findIndex(candidate => candidate.id === player.id)
  const ownTeam = team.playerTeams[index]
  if (ownTeam === undefined) return []
  return state.players.filter((candidate, playerIndex) => candidate.id !== player.id && team.playerTeams[playerIndex] === ownTeam)
}

export function marketplaceRequest(state: GameState, player: PlayerState): MarketplaceRequest {
  const goods = marketplaceGoods(state)
  const available = (owner: PlayerState): Partial<Resource> => Object.fromEntries(goods.map(good => [good, owner.resources[good] ?? 0]))
  return {
    kind: 'marketplace-select', goods, availableByResource: available(player),
    teammates: marketplaceTeammates(state, player).map(owner => ({ playerId: owner.id, name: owner.name, availableByResource: available(owner) })),
  }
}

export type MarketplaceSettlement = { giver: PlayerState; receiver: PlayerState; resource: MarketplaceGood; amount: number }
export function validateMarketplaceTransfers(state: GameState, player: PlayerState, raw: unknown):
  | { ok: true; transfers: MarketplaceTransfer[]; settlements: MarketplaceSettlement[] }
  | { ok: false; error: string } {
  const transfers = readMarketplaceTransfers(raw)
  const mates = marketplaceTeammates(state, player)
  const goods = marketplaceGoods(state)
  if (!transfers || !mates.length) return { ok: false, error: 'ui.marketplace.emptySelection' }
  const seen = new Set<MarketplaceGood>()
  const settlements: MarketplaceSettlement[] = []
  for (const transfer of transfers) {
    const mate = mates.find(owner => owner.id === transfer.teammatePlayerId)
    if (!mate || !goods.includes(transfer.resource) || seen.has(transfer.resource)) return { ok: false, error: 'ui.marketplace.insufficientGoods' }
    seen.add(transfer.resource)
    const giver = transfer.direction === 'give' ? player : mate
    const receiver = transfer.direction === 'give' ? mate : player
    if (transfer.amount + 1 > (giver.resources[transfer.resource] ?? 0)) return { ok: false, error: 'ui.marketplace.insufficientGoods' }
    settlements.push({ giver, receiver, resource: transfer.resource, amount: transfer.amount })
  }
  return { ok: true, transfers, settlements }
}

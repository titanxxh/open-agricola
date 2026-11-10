import type { Resource } from './types'

export const MARKETPLACE_GOODS = ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable', 'food', 'fuel', 'sheep', 'boar', 'cattle', 'horse'] as const satisfies readonly (keyof Resource)[]
export type MarketplaceGood = typeof MARKETPLACE_GOODS[number]
export type MarketplaceTransfer = {
  resource: MarketplaceGood
  direction: 'give' | 'take'
  teammatePlayerId: string
  amount: number
}
export type MarketplaceRequest = {
  kind: 'marketplace-select'
  goods: MarketplaceGood[]
  availableByResource: Partial<Resource>
  teammates: { playerId: string; name: string; availableByResource: Partial<Resource> }[]
}

export function readMarketplaceTransfers(value: unknown): MarketplaceTransfer[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const transfers: MarketplaceTransfer[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined
    const row: Record<string, unknown> = { ...item }
    if (Object.keys(row).some(key => !['resource', 'direction', 'teammatePlayerId', 'amount'].includes(key))) return undefined
    const resource = MARKETPLACE_GOODS.find(good => good === row.resource)
    if (!resource || (row.direction !== 'give' && row.direction !== 'take')
      || typeof row.teammatePlayerId !== 'string' || !row.teammatePlayerId
      || typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount < 1) return undefined
    transfers.push({ resource, direction: row.direction, teammatePlayerId: row.teammatePlayerId, amount: row.amount })
  }
  return transfers
}

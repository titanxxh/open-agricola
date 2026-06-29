import type { PlayerState, Resource } from '../contract/types'
import { positionKey } from './farm'
import { getUsedFarmyardTileKeys } from './farmyard-usage'
import { getFarmyardSpaceStates } from './farmyard-space-states'

const addResources = (
  target: Partial<Resource>,
  resources: Partial<Resource> | undefined,
) => {
  if (!resources) return
  for (const [key, amount] of Object.entries(resources)) {
    if (typeof amount !== 'number' || amount <= 0) continue
    const resource = key as keyof Resource
    target[resource] = (target[resource] ?? 0) + amount
  }
}

export const claimFarmyardGoodsTokens = (
  player: PlayerState,
  sourceCardId?: string,
): Partial<Resource> => {
  const used = getUsedFarmyardTileKeys(player)
  const gained: Partial<Resource> = {}
  const remaining = getFarmyardSpaceStates(player).filter((state) => {
    if (state.kind !== 'farmyard-goods-token') return true
    if (state.claimPolicy !== 'when-no-longer-unused') return true
    if (sourceCardId && state.sourceCardId !== sourceCardId) return true
    if (!used.has(state.spaceKey)) return true
    addResources(gained, state.resources)
    return false
  })
  player.farmyardSpaceStates = remaining
  addResources(player.resources, gained)
  return gained
}

export const hasClaimableFarmyardGoodsTokens = (
  player: PlayerState,
  sourceCardId?: string,
): boolean => {
  const used = getUsedFarmyardTileKeys(player)
  return getFarmyardSpaceStates(player).some((state) =>
    state.kind === 'farmyard-goods-token' &&
    state.claimPolicy === 'when-no-longer-unused' &&
    (!sourceCardId || state.sourceCardId === sourceCardId) &&
    used.has(state.spaceKey),
  )
}

const positionSet = (positions?: Array<{ row: number; col: number }>) =>
  positions ? new Set(positions.map(positionKey)) : null

export const claimFieldGoodsTokens = (
  player: PlayerState,
  sourceCardId?: string,
  positions?: Array<{ row: number; col: number }>,
): Partial<Resource> => {
  const eligiblePositions = positionSet(positions)
  const gained: Partial<Resource> = {}
  const remaining = getFarmyardSpaceStates(player).filter((state) => {
    if (state.kind !== 'field-goods-token') return true
    if (state.claimPolicy !== 'when-sowed') return true
    if (sourceCardId && state.sourceCardId !== sourceCardId) return true
    if (eligiblePositions && !eligiblePositions.has(state.spaceKey)) return true
    addResources(gained, state.resources)
    return false
  })
  player.farmyardSpaceStates = remaining
  addResources(player.resources, gained)
  return gained
}

export const hasClaimableFieldGoodsTokens = (
  player: PlayerState,
  sourceCardId?: string,
  positions?: Array<{ row: number; col: number }>,
): boolean => {
  const eligiblePositions = positionSet(positions)
  return getFarmyardSpaceStates(player).some((state) =>
    state.kind === 'field-goods-token' &&
    state.claimPolicy === 'when-sowed' &&
    (!sourceCardId || state.sourceCardId === sourceCardId) &&
    (!eligiblePositions || eligiblePositions.has(state.spaceKey)),
  )
}

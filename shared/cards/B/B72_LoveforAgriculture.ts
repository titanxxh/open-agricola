import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'
import { B72_LoveforAgriculture } from '../../cards-display/B/B72_LoveforAgriculture'

const CARD_ID = B72_LoveforAgriculture.id

type PastureCrop = {
  pastureId: string
  tiles: FarmTilePosition[]
  crop: 'grain' | 'vegetable'
  remaining: number
}

const posKey = (tile: FarmTilePosition) => `${tile.row}-${tile.col}`

const getPastureSize = (pasture: { tiles?: FarmTilePosition[]; size: number }) =>
  pasture.tiles && pasture.tiles.length > 0 ? pasture.tiles.length : pasture.size

const getPastureCrops = (player: PlayerState): PastureCrop[] =>
  readCardExtraData<PastureCrop[]>(player, CARD_ID, 'pastureCrops') ?? []

const setPastureCrops = (player: PlayerState, crops: PastureCrop[]) =>
  writeCardExtraData(player, CARD_ID, 'pastureCrops', crops)

/**
 * Get pastures eligible for sowing: size 1 or 2, not already sown.
 */
const getEligiblePastures = (player: PlayerState) => {
  const sownPastureIds = new Set(getPastureCrops(player).map((c) => c.pastureId))
  return player.pastures.filter(
    (p) => (p.size === 1 || p.size === 2) && !sownPastureIds.has(p.id),
  )
}

/**
 * For each eligible pasture, pick one tile as the sow target.
 * Use the first tile (sorted by row,col) that doesn't have a stable.
 */
const getPastureAnchorTile = (
  player: PlayerState,
  pastureId: string,
): FarmTilePosition | null => {
  const pasture = player.pastures.find((p) => p.id === pastureId)
  if (!pasture) return null
  const tiles = [...(pasture.tiles ?? [])].sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col,
  )
  // Pick first tile that doesn't have a stable
  const stableKeys = new Set(
    player.stableTiles.map(posKey),
  )
  const pastureTileKeys = new Set(tiles.map(posKey))
  for (const tile of tiles) {
    if (!stableKeys.has(posKey(tile)) || !pastureTileKeys.has(posKey(tile))) {
      return tile
    }
  }
  return tiles[0] ?? null
}

/**
 * Find which pasture a tile belongs to (among eligible pastures).
 */
const findPastureByTile = (
  player: PlayerState,
  tile: FarmTilePosition,
): string | null => {
  const key = posKey(tile)
  for (const pasture of player.pastures) {
    if (pasture.size !== 1 && pasture.size !== 2) continue
    for (const t of pasture.tiles ?? []) {
      if (posKey(t) === key) return pasture.id
    }
  }
  return null
}

const isDoableListener: CardListenerRegistration = {
  id: 'B72-love-agriculture-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // If already doable via normal fields, no need to intervene
    if (canSow(context.player)) return
    // Check if there are seeds AND eligible pastures
    const hasSeeds =
      context.player.resources.grain > 0 || context.player.resources.vegetable > 0
    if (!hasSeeds) return
    const eligible = getEligiblePastures(context.player)
    if (eligible.length === 0) return
    return { doable: true }
  },
}

export const B72_LoveforAgriculture_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  // Provide extra sowable tiles from eligible pastures
  onComputeSowableFields: (player): ExtraSowableField[] => {
    const eligible = getEligiblePastures(player)
    const extras: ExtraSowableField[] = []
    for (const pasture of eligible) {
      const anchor = getPastureAnchorTile(player, pasture.id)
      if (!anchor) continue
      extras.push({
        tile: anchor,
        allowedCrops: ['grain', 'vegetable'],
        sourceCard: CARD_ID,
      })
    }
    return extras
  },

  // Handle sowing into a pasture tile
  onSowExtraField: (player, tile, crop): boolean => {
    const pastureId = findPastureByTile(player, tile)
    if (!pastureId) return false
    if (crop !== 'grain' && crop !== 'vegetable') return false
    const pasture = player.pastures.find((p) => p.id === pastureId)
    if (!pasture || (pasture.size !== 1 && pasture.size !== 2)) return false

    // Check not already sown
    const existing = getPastureCrops(player)
    if (existing.some((c) => c.pastureId === pastureId)) return false

    // Deduct resource
    if (player.resources[crop] <= 0) return false
    player.resources[crop] -= 1

    // Store sown crop
    const remaining = crop === 'grain' ? 3 : 2
    existing.push({
      pastureId,
      tiles: pasture.tiles ?? [],
      crop,
      remaining,
    })
    setPastureCrops(player, existing)
    return true
  },

  // Harvest from sown pastures during field phase
  onHarvestFieldPhase: (_state, player) => {
    const crops = getPastureCrops(player)
    if (crops.length === 0) return
    for (const entry of crops) {
      if (entry.remaining <= 0) continue
      player.resources[entry.crop] += 1
      entry.remaining -= 1
    }
    // Remove exhausted crops
    const remaining = crops.filter((c) => c.remaining > 0)
    setPastureCrops(player, remaining)
  },

  computePastureCapacityModifiers: (player) => {
    const crops = getPastureCrops(player)
    if (crops.length === 0) return []
    const sownPastureIds = new Set(crops.map((crop) => crop.pastureId))
    return [{
      sourceCard: CARD_ID,
      kind: 'additive',
      appliesTo: ({ pasture }) => sownPastureIds.has(pasture.id),
      apply: (capacity, { pasture }) => Math.max(0, capacity - getPastureSize(pasture)),
    }]
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

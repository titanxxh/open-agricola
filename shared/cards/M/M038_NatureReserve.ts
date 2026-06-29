import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { computeFencedRegions } from '../../domain/farmyard'
import { positionKey } from '../../domain/farm'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'M038_NatureReserve'
const RESERVE_TILES_KEY = 'natureReserveTiles'

type ReserveTile = { row: number; col: number }

const regionKey = (tiles: readonly FarmTilePosition[]) =>
  tiles.map(positionKey).sort().join('|')

const isAdjacent = (tile: FarmTilePosition, other: FarmTilePosition) =>
  Math.abs(tile.row - other.row) + Math.abs(tile.col - other.col) === 1

const reserveTiles = (player: PlayerState): ReserveTile[] =>
  readCardExtraData<ReserveTile[]>(player, CARD_ID, RESERVE_TILES_KEY) ?? []

const writeReserveTiles = (player: PlayerState, tiles: ReserveTile[]) => {
  const seen = new Set<string>()
  writeCardExtraData(
    player,
    CARD_ID,
    RESERVE_TILES_KEY,
    tiles.filter((tile) => {
      const key = positionKey(tile)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  )
}

const terrainAdjacentToPastureTiles = (player: PlayerState): FarmTilePosition[] => {
  const pastureTiles = player.pastures.flatMap((pasture) => pasture.tiles ?? [])
  if (pastureTiles.length === 0) return []
  return (player.farmTerrain ?? [])
    .filter((tile) => tile.kind === 'forest' || tile.kind === 'moor')
    .filter((tile) => pastureTiles.some((pastureTile) => isAdjacent(tile, pastureTile)))
    .map((tile) => ({ row: tile.row, col: tile.col }))
}

const fencedRegions = (player: PlayerState) =>
  computeFencedRegions(
    new Set((player.fenceSegments ?? []).map((segment) => segment.edge)),
    player,
  ).filter((region) => region.fenced)

const recordReserveTiles = (player: PlayerState) => {
  const candidates = new Set(terrainAdjacentToPastureTiles(player).map(positionKey))
  if (candidates.size === 0) return
  const pastureRegions = new Set(player.pastures.map((pasture) => regionKey(pasture.tiles ?? [])))
  const next = reserveTiles(player)
  for (const region of fencedRegions(player)) {
    if (pastureRegions.has(regionKey(region.tiles))) continue
    for (const tile of region.tiles) {
      const key = positionKey(tile)
      if (candidates.has(key)) next.push({ row: tile.row, col: tile.col })
    }
  }
  writeReserveTiles(player, next)
}

const activateReserveTiles = (player: PlayerState) => {
  const reserves = reserveTiles(player)
  if (reserves.length === 0) return
  const terrainKeys = new Set((player.farmTerrain ?? []).map(positionKey))
  const regions = fencedRegions(player)
  const pastureRegions = new Set(player.pastures.map((pasture) => regionKey(pasture.tiles ?? [])))
  const stableKeys = new Set(player.stableTiles.map(positionKey))
  const nextPastures = [...player.pastures]
  const remaining: ReserveTile[] = []
  for (const reserve of reserves) {
    const key = positionKey(reserve)
    if (terrainKeys.has(key)) {
      remaining.push(reserve)
      continue
    }
    const region = regions.find((candidate) =>
      candidate.tiles.some((tile) => positionKey(tile) === key),
    )
    if (!region) {
      remaining.push(reserve)
      continue
    }
    const fencedKey = regionKey(region.tiles)
    if (pastureRegions.has(fencedKey)) continue
    nextPastures.push({
      id: `pasture-${nextPastures.length + 1}`,
      size: region.tiles.length,
      tiles: region.tiles,
      stables: region.tiles.filter((tile) => stableKeys.has(positionKey(tile))).length,
      animalType: null,
      animalCount: 0,
    })
    pastureRegions.add(fencedKey)
  }
  player.pastures = nextPastures
  writeReserveTiles(player, remaining)
}

const recordListener: CardListenerRegistration = {
  id: 'M038-nature-reserve-record-fenced-terrain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    recordReserveTiles(context.ownerPlayer ?? context.player)
  },
}

const activateListener: CardListenerRegistration = {
  id: 'M038-nature-reserve-activate-cleared-terrain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fell-trees', 'cut-peat', 'slash-and-burn'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    activateReserveTiles(context.ownerPlayer ?? context.player)
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'leaf' as const,
      actionId: 'fence',
      sourceCard: CARD_ID,
      actionContext: {
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          segmentBounds: { total: { min: 1, max: 4 } },
          newRegionBounds: {
            count: { min: 1, max: 1 },
            totalSize: { min: 1, max: 1 },
          },
          allowedNewRegionTiles: terrainAdjacentToPastureTiles(player),
          allowTerrainInNewRegions: true,
          suppressTerrainRegions: true,
          costPolicy: { fence: { wood: 0 } },
        },
      },
    }),
  },
  listeners: [recordListener, activateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M038_NatureReserve = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nature Reserve",
    deck: "M",
    number: 38,
    category: "FARM_PLANNER",
    desc: [
        "Immediately fence a farmyard space containing at least 1 forest or moor that is adjacent to a pasture, without paying wood for the fences. Once there are no tiles left in the fenced area, the farmyard space becomes a pasture."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "1 Pasture",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M038_NatureReserve_impl = M038_NatureReserve.impl

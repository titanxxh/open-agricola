import type { DraftGameEvent, EventSink } from '../../contract/events'
import { assertKnownGameEventShape } from '../../events/guards'
import { getActionTerrainOperations } from '../helpers/farmyard-events'
import { defineMinorCard } from '../card-source'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import type { ActionDefinition, FarmOperationResult, FarmTilePosition, PlayerState } from '../../contract/types'
import { computeFencedRegions } from '../../domain/farmyard'
import { parsePositionKey, positionKey } from '../../domain/farm'
import { commitFarmOperation } from '../../domain/farm-operations'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { getFarmyardFields } from '../helpers/card-field'

const CARD_ID = 'M038_NatureReserve'
const RESERVE_TILES_KEY = 'natureReserveTiles'
const RECORD_ACTION_ID = 'card_M038_NatureReserve_recordTiles'
const ACTIVATE_ACTION_ID = 'card_M038_NatureReserve_activateTiles'

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

const activateReserveTiles = (player: PlayerState, positions: string[], eventSink: EventSink, terrainReplacements: DraftGameEvent<'farm.terrainChanged'>[]): FarmOperationResult | undefined => {
  const cleared = new Set(positions)
  const reserves = reserveTiles(player)
  if (reserves.length === 0) return
  const terrainKeys = new Set((player.farmTerrain ?? []).map(positionKey))
  const fieldKeys = new Set(getFarmyardFields(player).map(positionKey))
  const regions = fencedRegions(player)
  const pastureRegions = new Set(player.pastures.map((pasture) => regionKey(pasture.tiles ?? [])))
  const nextPastures = [...player.pastures]
  const remaining: ReserveTile[] = []
  for (const reserve of reserves) {
    const key = positionKey(reserve)
    if (!cleared.has(key) || terrainKeys.has(key)) {
      remaining.push(reserve)
      continue
    }
    if (fieldKeys.has(key)) continue
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
      tiles: region.tiles,
      animalType: null,
      animalCount: 0,
    })
    pastureRegions.add(fencedKey)
  }
  const operation = nextPastures.length > player.pastures.length
    ? commitFarmOperation(player, { kind: 'pastures', positions: positions.flatMap(key => { const tile = parsePositionKey(key); return tile ? [tile] : [] }),
      pastures: nextPastures, sourceCardId: CARD_ID, replacesTerrain: terrainReplacements }, eventSink) : undefined
  writeReserveTiles(player, remaining)
  return operation
}

const reserveAction = (
  id: string,
  execute: (player: PlayerState, positions: string[], eventSink: EventSink, terrainReplacements: DraftGameEvent<'farm.terrainChanged'>[]) => FarmOperationResult | void,
): ActionDefinition => ({
  id,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.minorPlayed.includes(CARD_ID),
  execute: ({ player, params, eventSink }) => {
    const terrainReplacements: DraftGameEvent<'farm.terrainChanged'>[] = []
    for (const captured of Array.isArray(params?.terrainReplacements) ? params.terrainReplacements : []) {
      if (!captured || typeof captured !== 'object' || !('type' in captured) || captured.type !== 'farm.terrainChanged') continue
      assertKnownGameEventShape(captured)
      terrainReplacements.push(captured as DraftGameEvent<'farm.terrainChanged'>)
    }
    const operation = execute(player, Array.isArray(params?.positions) ? params.positions.filter((value): value is string => typeof value === 'string') : [], eventSink, terrainReplacements)
    return { type: 'ok', ...(operation ? { farmOperations: [operation] } : {}) }
  },
})

registerAdHocAction(reserveAction(RECORD_ACTION_ID, recordReserveTiles))
registerAdHocAction(reserveAction(ACTIVATE_ACTION_ID, activateReserveTiles))

const recordListener: CardListenerRegistration = {
  id: 'M038-nature-reserve-record-fenced-terrain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return {
      flow: { type: 'leaf', actionId: RECORD_ACTION_ID, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const activateListener: CardListenerRegistration = {
  id: 'M038-nature-reserve-activate-cleared-terrain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  events: ['farm.terrainChanged'],
  handler: (context): ActionHookResult | void => {
    const terrainReplacements = getActionTerrainOperations(context).filter(event => event.playerId === context.player.id)
      .map(event => ({
        type: 'farm.terrainChanged' as const, playerId: event.playerId, operation: event.operation,
        changes: event.changes.map(change => ({ ...change,
          before: change.before ? { ...change.before } : null,
          after: change.after ? { ...change.after } : null,
        })),
        newlyUsedTiles: event.newlyUsedTiles.map(tile => ({ ...tile })),
      }))
    const positions = terrainReplacements.flatMap(event =>
      event.playerId === context.player.id
        ? event.changes.filter(change => change.before && !change.after).map(positionKey) : [])
    if (!positions.some(key => reserveTiles(context.player).some(tile => positionKey(tile) === key))) return
    return {
      flow: { type: 'leaf', actionId: ACTIVATE_ACTION_ID, sourceCard: CARD_ID, params: { positions, terrainReplacements } },
      sourceCard: CARD_ID,
    }
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
        "Immediately <FENCE> a farmyard space containing at least 1 <FOREST> or <MOOR> that is adjacent to a pasture, without paying <WOOD> for the <FENCE>. Once there are no tiles left in the fenced area, the farmyard space becomes a pasture."
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

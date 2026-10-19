import { getActionTerrainOperations } from '../helpers/farmyard-events'
import { defineMinorCard } from '../card-source'
import { registerSelectionEffect, registerSelectionValidator } from '../../actions/helpers/selection-effect-registry'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import { readCardExtraData, writeCardExtraData, isCardFlagged } from '../helpers/card-state'
import { inactiveWorkersInSupply } from '../../domain/player'
import { reserveSupplyWorker } from '../../domain/supply-workers'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../helpers/supply-worker-flow'
import { parsePositionKey } from '../../domain/farm'
import { getVisibleTerrainTiles, getVisibleFarmTerrain } from '../../moor/farm-terrain'
import type { FarmTilePosition } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M053_ForestHut'
const SELECTION_EFFECT = 'M053-forest-hut-bind'
const TEMP_WORKER_KEY = 'temporaryWorkerId'
const BOUND_FOREST_KEY = 'boundForest'
const BOUND_FOREST_DEPTH_KEY = 'boundForestDepth'
const FARM_TERRAIN_MARKERS_KEY = 'farmTerrainMarkers'
const UNLOCK_ACTION = `card_${CARD_ID}_unlock`

const sameTile = (a: FarmTilePosition | undefined, b: FarmTilePosition | undefined) =>
  !!a && !!b && a.row === b.row && a.col === b.col

registerSelectionValidator(SELECTION_EFFECT, ({ player, positions }) => {
  const tile = parsePositionKey(positions[0] ?? '')
  if (!tile || getVisibleFarmTerrain(player, tile)?.kind !== 'forest') return 'invalid forest selection'
})

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions }) => {
  const tile = parsePositionKey(positions[0] ?? '')
  if (!tile) return
  const worker = reserveSupplyWorker(player, CARD_ID)
  if (!worker) return
  writeCardExtraData(player, CARD_ID, TEMP_WORKER_KEY, worker.id)
  writeCardExtraData(player, CARD_ID, BOUND_FOREST_KEY, tile)
  writeCardExtraData(player, CARD_ID, BOUND_FOREST_DEPTH_KEY, getVisibleFarmTerrain(player, tile)?.covered ? 2 : 1)
  writeCardExtraData(player, CARD_ID, FARM_TERRAIN_MARKERS_KEY, [{
    row: tile.row,
    col: tile.col,
    kind: 'person',
    workerId: worker.id,
    sourceCard: CARD_ID,
  }])
})

registerAdHocAction({
  id: UNLOCK_ACTION,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    const workerId = readCardExtraData<string>(player, CARD_ID, TEMP_WORKER_KEY)
    const worker = player.workers.find((entry) => entry.id === workerId)
    if (!worker?.supplyUse || worker.supplyUse.sourceCard !== CARD_ID || worker.supplyUse.status !== 'reserved') return { type: 'ok' }
    worker.supplyUse.returnRound = state.round
    writeCardExtraData(player, CARD_ID, BOUND_FOREST_KEY, undefined)
    writeCardExtraData(player, CARD_ID, BOUND_FOREST_DEPTH_KEY, undefined)
    writeCardExtraData(player, CARD_ID, FARM_TERRAIN_MARKERS_KEY, [])
    return { type: 'ok' }
  },
})

const unlockListener: CardListenerRegistration = {
  id: 'M053-forest-hut-after-forest-removed',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  events: ['farm.terrainChanged'],
  handler: (context) => {
    const bound = readCardExtraData<FarmTilePosition>(context.player, CARD_ID, BOUND_FOREST_KEY)
    const depth = readCardExtraData<number>(context.player, CARD_ID, BOUND_FOREST_DEPTH_KEY)
    if (!bound || !depth) return
    const removed = getActionTerrainOperations(context).some(event => event.playerId === context.player.id && event.operation !== 'cover' && event.operation !== 'place'
      && event.changes.some(change => sameTile(bound, change) && change.before?.kind === 'forest'
        && (change.before.covered ? 2 : 1) === depth))
    if (!removed) return
    const workerId = readCardExtraData<string>(context.player, CARD_ID, TEMP_WORKER_KEY)
    if (!workerId) return
    const worker = (context.player.workers ?? []).find((entry) => entry.id === workerId)
    if (!worker?.supplyUse || worker.supplyUse.sourceCard !== CARD_ID || worker.supplyUse.status !== 'reserved') return
    return { flow: { type: 'leaf', actionId: UNLOCK_ACTION, sourceCard: CARD_ID } }
  },
}

const cardImpl = {
  listeners: [unlockListener],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if (inactiveWorkersInSupply(player).length === 0) return
      const selectableTiles = getVisibleTerrainTiles(player, 'forest')
      if (selectableTiles.length === 0) return
      return {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectionEffect: SELECTION_EFFECT,
          minSelections: 1,
          maxSelections: 1,
          selectableTiles,
        },
      }
    },
    extraTurnBeforeWorkers: true,
    contributeExtraTurn: (state, player) => {
      if (isCardFlagged(player, CARD_ID)) return
      const workerId = readCardExtraData<string>(player, CARD_ID, TEMP_WORKER_KEY)
      const worker = player.workers.find((entry) => entry.id === workerId)
      if (worker?.supplyUse?.status !== 'reserved' || worker.supplyUse.returnRound !== state.round) return
      return supplyWorkerTurnFlow(state, player, CARD_ID, [consumeSupplyWorkerTurn(CARD_ID)], worker.id)
    },
    onReturnHome: (_state, player) => {
      if (readCardExtraData<FarmTilePosition>(player, CARD_ID, BOUND_FOREST_KEY)) return
      writeCardExtraData(player, CARD_ID, TEMP_WORKER_KEY, undefined)
      writeCardExtraData(player, CARD_ID, FARM_TERRAIN_MARKERS_KEY, [])
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M053_ForestHut = defineMinorCard({
  presentation: { farmTerrainMarkers: true },
  meta: {
    id: CARD_ID,
    name: "Forest Hut",
    deck: "M",
    number: 53,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Place 1 person from your supply on a <FOREST>. Once you remove the <FOREST>, you can place the person that round. In the returning home phase of that round, return the person to your supply. Until then, you cannot use it for family growth."
    ],
    cost: {
        "wood": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M053_ForestHut_impl = M053_ForestHut.impl

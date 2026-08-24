import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { inactiveWorkersInSupply } from '../../domain/player'
import { parsePositionKey } from '../../domain/farm'
import { getVisibleTerrainTiles } from '../../moor/farm-terrain'
import type { ActionFlow, FarmTilePosition } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M053_ForestHut'
const SELECTION_EFFECT = 'M053-forest-hut-bind'
const TEMP_WORKER_KEY = 'temporaryWorkerId'
const BOUND_FOREST_KEY = 'boundForest'
const FARM_TERRAIN_MARKERS_KEY = 'farmTerrainMarkers'

const sameTile = (a: FarmTilePosition | undefined, b: FarmTilePosition | undefined) =>
  !!a && !!b && a.row === b.row && a.col === b.col

const selectedTile = (context: CardListenerContext): FarmTilePosition | undefined => {
  const tile = (context.extraData?.payload as { tile?: { row?: unknown; col?: unknown } } | undefined)?.tile
  if (!tile) return undefined
  const row = Number(tile.row)
  const col = Number(tile.col)
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : undefined
}

const terrainSelectionTiles = (context: CardListenerContext): FarmTilePosition[] => {
  const extraData = context.result && context.result.type !== 'fail' ? context.result.extraData : undefined
  const selected = extraData?.selectedPositions
  if (!Array.isArray(selected)) return []
  return selected.flatMap((entry) =>
    typeof entry === 'string'
      ? (parsePositionKey(entry) ? [parsePositionKey(entry)!] : [])
      : [])
}

const selectedForestRemovalTiles = (context: CardListenerContext): FarmTilePosition[] => {
  if (context.actionId === 'fell-trees' || context.actionId === 'slash-and-burn') {
    const tile = selectedTile(context)
    return tile ? [tile] : []
  }
  if (context.actionId !== 'selection') return []
  const mode = context.actionContext?.terrainMode
  const removesForest =
    (mode === 'remove' && context.actionContext?.terrainKind === 'forest') ||
    ((mode === 'replace-kind' || mode === 'replace-with-field') &&
      context.actionContext?.terrainFromKind === 'forest')
  return removesForest ? terrainSelectionTiles(context) : []
}

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions }) => {
  const tile = parsePositionKey(positions[0] ?? '')
  if (!tile) return
  const worker = inactiveWorkersInSupply(player)[0]
  if (!worker) return
  worker.isActive = false
  worker.isNewborn = false
  worker.removedFromSupply = true
  writeCardExtraData(player, CARD_ID, TEMP_WORKER_KEY, worker.id)
  writeCardExtraData(player, CARD_ID, BOUND_FOREST_KEY, tile)
  writeCardExtraData(player, CARD_ID, FARM_TERRAIN_MARKERS_KEY, [{
    row: tile.row,
    col: tile.col,
    kind: 'person',
    workerId: worker.id,
    sourceCard: CARD_ID,
  }])
})

const unlockFlow = (workerId: string): ActionFlow => ({
  type: 'seq',
  optional: true,
  children: [{
    type: 'leaf',
    actionId: 'place-farmer',
    sourceCard: CARD_ID,
    actionContext: {
      trueAction: false,
      extraPlacement: true,
      fromSupply: true,
      temporaryFromSupply: true,
      temporaryWorkerId: workerId,
      markForRemoval: true,
    },
  }],
})

const unlockListener: CardListenerRegistration = {
  id: 'M053-forest-hut-after-forest-removed',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fell-trees', 'slash-and-burn', 'selection'],
  handler: (context) => {
    const bound = readCardExtraData<FarmTilePosition>(context.player, CARD_ID, BOUND_FOREST_KEY)
    if (!selectedForestRemovalTiles(context).some((tile) => sameTile(bound, tile))) return
    const workerId = readCardExtraData<string>(context.player, CARD_ID, TEMP_WORKER_KEY)
    if (!workerId) return
    const worker = (context.player.workers ?? []).find((entry) => entry.id === workerId)
    if (!worker || worker.isActive || worker.removedFromSupply !== true) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: BOUND_FOREST_KEY, value: undefined },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: FARM_TERRAIN_MARKERS_KEY, value: [] },
          },
          unlockFlow(workerId),
        ],
      },
      sourceCard: CARD_ID,
    }
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
    onReturnHome: (state, player) => {
      if (readCardExtraData<FarmTilePosition>(player, CARD_ID, BOUND_FOREST_KEY)) return
      const workerId = readCardExtraData<string>(player, CARD_ID, TEMP_WORKER_KEY)
      if (!workerId) return
      state.actionSpaces.forEach((space) => {
        space.takenBy = space.takenBy.filter((worker) =>
          !(worker.playerId === player.id && worker.workerId === workerId),
        )
      })
      const worker = (player.workers ?? []).find((entry) => entry.id === workerId)
      if (worker) {
        worker.isActive = false
        worker.isNewborn = false
        worker.removedFromSupply = false
      }
      writeCardExtraData(player, CARD_ID, TEMP_WORKER_KEY, undefined)
      writeCardExtraData(player, CARD_ID, 'markedSpaceId', undefined)
      writeCardExtraData(player, CARD_ID, FARM_TERRAIN_MARKERS_KEY, [])
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M053_ForestHut = defineMinorCard({
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

import type { ActionFlow, FarmTilePosition, PlayerState } from '../../contract/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import {
  addFarmyardExtension,
  getFarmyardExtensionCandidates,
} from '../../domain/farmyard-extensions'
import { parsePositionKey, positionKey } from '../../domain/farm'

const SELECTION_EFFECT = 'moor-farmyard-extension-place'

const parsePositions = (positions: string[]): FarmTilePosition[] =>
  positions.flatMap((position) => {
    const parsed = parsePositionKey(position)
    return parsed ? [parsed] : []
  })

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions, sourceCard, actionContext }) => {
  if (!sourceCard) return
  const tiles = parsePositions(positions)
  if (!addFarmyardExtension(player, sourceCard, tiles)) return
  if (actionContext?.placeMoors !== true) return
  const terrainKeys = new Set((player.farmTerrain ?? []).map(positionKey))
  for (const tile of tiles) {
    const key = positionKey(tile)
    if (terrainKeys.has(key)) continue
    player.farmTerrain = [...(player.farmTerrain ?? []), { ...tile, kind: 'moor' }]
    terrainKeys.add(key)
  }
})

export const buildFarmyardExtensionSelectionFlow = (
  sourceCard: string,
  player: PlayerState,
  placeMoors = false,
): ActionFlow | undefined => {
  const validPositionGroups = getFarmyardExtensionCandidates(player)
  if (validPositionGroups.length === 0) return
  const selectableByKey = new Map<string, FarmTilePosition>()
  validPositionGroups.flat().forEach((tile) => selectableByKey.set(positionKey(tile), tile))
  return {
    type: 'leaf',
    actionId: 'selection',
    sourceCard,
    actionContext: {
      selectionKind: 'farm-position',
      selectionEffect: SELECTION_EFFECT,
      minSelections: 2,
      maxSelections: 2,
      allowedSelectionCounts: [2],
      selectableTiles: [...selectableByKey.values()],
      validPositionGroups,
      ...(placeMoors ? { placeMoors: true } : {}),
    },
  }
}

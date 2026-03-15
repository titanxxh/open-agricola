import type { ActionCostPreview, ActionDefinition, FarmTilePosition, PlayerState } from '../../game/types'
import { getAllTilePositions, getNextEmptyTileForPlayer, positionKey } from '../../game/farm'
import { canExecuteWithCostPreview } from './cost-preview'

export const addField = (player: PlayerState) => {
  const next = getNextEmptyTileForPlayer(player)
  if (!next) return
  player.fields.push({ crop: null, remaining: 0, row: next.row, col: next.col })
}

const getOccupiedKeys = (player: PlayerState) => {
  const keys = new Set<string>()
  player.roomTiles.forEach((tile) => keys.add(positionKey(tile)))
  player.fields.forEach((field) =>
    keys.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => keys.add(positionKey(tile)))
  player.pastures.forEach((pasture) => {
    pasture.tiles.forEach((tile) => keys.add(positionKey(tile)))
  })
  return keys
}

const isAdjacentToField = (
  position: FarmTilePosition,
  fieldKeys: Set<string>,
) => {
  const deltas = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ]
  return deltas.some((delta) =>
    fieldKeys.has(`${position.row + delta.dr}-${position.col + delta.dc}`),
  )
}

export const getPlowableTiles = (player: PlayerState) => {
  const occupied = getOccupiedKeys(player)
  const fieldKeys = new Set(
    player.fields.map((field) =>
      positionKey({ row: field.row, col: field.col }),
    ),
  )
  if (fieldKeys.size === 0) {
    return getAllTilePositions().filter(
      (pos) => !occupied.has(positionKey(pos)),
    )
  }
  return getAllTilePositions().filter((pos) => {
    if (occupied.has(positionKey(pos))) return false
    return isAdjacentToField(pos, fieldKeys)
  })
}

export const plowCostPreview: ActionCostPreview = {
  isStructurallyPossible: ({ player }) => getPlowableTiles(player).length > 0,
  getBaseCost: () => ({}),
}

export const plowAction: ActionDefinition = {
  id: 'plow',
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    canExecuteWithCostPreview(plowCostPreview, { state, player }),
  costPreview: plowCostPreview,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.interactionPlowSelect',
    options: [
      { value: 'confirm', labelKey: 'ui.interactionPlowConfirm' },
      { value: 'cancel', labelKey: 'ui.interactionPlowCancel' },
    ],
  }),
  resolveChoice: () => ({ type: 'ok' }),
}

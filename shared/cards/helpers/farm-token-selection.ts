import type { ActionFlow, FarmTilePosition, PlayerState, Resource } from '../../contract/types'
import { getFarmyardTilePositions, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'
import { addFarmyardSpaceState } from '../../domain/farm-operations'
import { registerSelectionEffect, registerSelectionValidator } from '../../actions/helpers/selection-effect-registry'

export function farmTokenSelection(
  cardId: string,
  resources: Partial<Resource>,
  options: { adjacentHouse?: boolean; onPlaced?: (player: PlayerState) => ActionFlow | void } = {},
) {
  const effect = cardId + '-farm-token'
  registerSelectionEffect(effect, ({ player, positions, eventSink, recordFarmOperation }) => {
    for (const key of positions)
      recordFarmOperation?.(
        addFarmyardSpaceState(
          player,
          {
            spaceKey: key,
            sourceCardId: cardId,
            kind: 'blocked-farmyard-space',
            resources,
            blocksPlacement: true,
          },
          eventSink,
        ),
      )
    return options.onPlaced?.(player)
  })
  const candidates = (player: PlayerState): FarmTilePosition[] => {
    const used = getUsedFarmyardTileKeys(player)
    return getFarmyardTilePositions(player).filter(
      (tile) =>
        !used.has(positionKey(tile)) &&
        (!options.adjacentHouse ||
          player.roomTiles.some(
            (room) => Math.abs(room.row - tile.row) + Math.abs(room.col - tile.col) === 1,
          )),
    )
  }
  registerSelectionValidator(effect, ({ player, positions }) => {
    const allowed = new Set(candidates(player).map(positionKey))
    if (positions.length !== 1 || !allowed.has(positions[0]!)) return 'log.actionNotAvailable'
  })
  return {
    candidates,
    flow: (player: PlayerState): ActionFlow => ({
      type: 'leaf',
      actionId: 'selection',
      sourceCard: cardId,
      actionContext: {
        selectionKind: 'farm-position',
        selectionEffect: effect,
        minSelections: 1,
        maxSelections: 1,
        selectableTiles: candidates(player),
      },
    }),
  }
}

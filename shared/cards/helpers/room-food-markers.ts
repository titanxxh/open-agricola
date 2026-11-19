import type { ActionFlow, PlayerState } from '../../contract/types'
import { positionKey } from '../../domain/farm'
import {
  registerSelectionEffect,
  registerSelectionValidator,
} from '../../actions/helpers/selection-effect-registry'
import { readCardExtraData, writeCardExtraData } from './card-state'
import { payLeaf } from './pay-gain-node'

export function roomFoodMarkers(cardId: string, paid: boolean, resource: 'food' | 'wood' = 'food') {
  const effectId = cardId + '-mark-room'
  const marked = (player: PlayerState) =>
    readCardExtraData<string[]>(player, cardId, resource + 'Rooms') ?? []
  const available = (player: PlayerState) =>
    player.roomTiles.filter((tile) => !marked(player).includes(positionKey(tile)))
  registerSelectionValidator(effectId, ({ player, positions }) => {
    const allowed = new Set(available(player).map(positionKey))
    if (
      new Set(positions).size !== positions.length ||
      positions.some((key) => !allowed.has(key)) ||
      (paid && positions.length > player.resources[resource])
    )
      return 'log.actionNotAvailable'
  })
  registerSelectionEffect(effectId, ({ player, positions }) => {
    writeCardExtraData(player, cardId, resource + 'Rooms', [...marked(player), ...positions])
    if (paid && positions.length) return payLeaf({ cardId, cost: { [resource]: positions.length } })
  })
  return {
    onRoomsRemoved: (player: PlayerState, positions: readonly { row: number; col: number }[]) =>
      writeCardExtraData(
        player,
        cardId,
        resource + 'Rooms',
        marked(player).filter((key) => !positions.some((p) => positionKey(p) === key)),
      ),
    flow(player: PlayerState, count: number, allowedRooms?: ReadonlySet<string>): ActionFlow | undefined {
      const selectableTiles = available(player).filter(tile => !allowedRooms || allowedRooms.has(positionKey(tile)))
      const maxSelections = Math.min(
        count,
        selectableTiles.length,
        paid ? player.resources[resource] : count,
      )
      return maxSelections > 0
        ? {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: cardId,
            optional: true,
            actionContext: {
              selectionKind: 'farm-position',
              selectionEffect: effectId,
              minSelections: 1,
              maxSelections,
              selectableTiles: selectableTiles.map(({ row, col }) => ({ row, col })),
            },
          }
        : undefined
    },
    score: (player: PlayerState) =>
      marked(player).filter((key) => player.roomTiles.some((tile) => positionKey(tile) === key))
        .length,
    presentation: (player: PlayerState) => ({
      farmTerrainMarkers: marked(player).map((key) => {
        const [row, col] = key.split('-').map(Number)
        return { row: row!, col: col!, kind: resource }
      }),
    }),
  }
}

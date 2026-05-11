import { FARM_COLS, FARM_ROWS, positionKey } from '../../domain/farm'
import type { CardImpl } from '../registry'

// D37 Sculpture: playable only if `roundsLeft > unusedFarmyardSpaces`,
// where roundsLeft = 14 - currentRound (BGA uses `14 - Globals::getTurn()`).
export const D37_Sculpture_impl = {
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const used = new Set<string>()
    player.roomTiles.forEach((tile) => used.add(positionKey(tile)))
    player.fields.forEach((field) =>
      used.add(positionKey({ row: field.row, col: field.col })),
    )
    player.stableTiles.forEach((tile) => used.add(positionKey(tile)))
    player.pastures.forEach((pasture) =>
      pasture.tiles?.forEach((tile) => used.add(positionKey(tile))),
    )
    const unused = FARM_ROWS * FARM_COLS - used.size
    const roundsLeft = Math.max(0, 14 - (state.round ?? 1))
    return roundsLeft > unused
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

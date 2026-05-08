import { MinorImprovement } from '../../cards-display/types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { FARM_COLS, FARM_ROWS, positionKey } from '../../domain/farm'

const CARD_ID = 'D37_Sculpture'

// D37 Sculpture: playable only if `roundsLeft > unusedFarmyardSpaces`,
// where roundsLeft = 14 - currentRound (BGA uses `14 - Globals::getTurn()`).
registerPrerequisite('More Rounds Left Than Unused Farmyard Spaces', (player, state) => {
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
})

export const D37_Sculpture = new MinorImprovement({
  id: CARD_ID,
  name: 'Sculpture',
  deck: 'D',
  number: 37,
  category: 'POINTS_PROVIDER',
  desc: ['You can only play this card if there are more complete rounds left to play than you have unused farmyard spaces.'],
  cost: { stone: 1 },
  vp: 2,
  prerequisite: 'More Rounds Left Than Unused Farmyard Spaces',
})

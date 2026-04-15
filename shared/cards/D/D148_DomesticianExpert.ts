import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D148_DomesticianExpert'

const countAdjacentRoomPairs = (roomTiles: Array<{row: number, col: number}>): number => {
  let pairs = 0
  const tileSet = new Set(roomTiles.map(t => `${t.row}-${t.col}`))
  for (const tile of roomTiles) {
    // Check right and down neighbors only to avoid double-counting
    if (tileSet.has(`${tile.row}-${tile.col + 1}`)) pairs++
    if (tileSet.has(`${tile.row + 1}-${tile.col}`)) pairs++
  }
  return pairs
}

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const roomTiles = player.roomTiles ?? []
    const pairs = countAdjacentRoomPairs(roomTiles)
    if (pairs === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: pairs * 2,
      animalType: 'sheep',
      animalCount: 0,
    })
  },
})

export const D148_DomesticianExpert = new Occupation({
  id: CARD_ID,
  name: 'Domestician Expert',
  deck: 'D',
  number: 148,
  desc: ['You can keep 2 <SHEEP> on the border between each pair of orthogonally adjacent rooms.'],
  cost: {},
  players: '4+',
})

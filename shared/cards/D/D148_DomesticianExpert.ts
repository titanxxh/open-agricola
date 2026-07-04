import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { PlayerState } from '../../contract/types'

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

const countHeldSheep = (player: PlayerState): number => {
  const extra = player.cardStates?.[CARD_ID]?.extraData as { held?: unknown; animalType?: unknown } | undefined
  if (extra?.animalType !== 'sheep') return 0
  if (typeof extra.held !== 'number' || !Number.isFinite(extra.held)) return 0
  return Math.max(0, Math.floor(extra.held))
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones, _state) => {
    const roomTiles = player.roomTiles ?? []
    const pairs = countAdjacentRoomPairs(roomTiles)
    if (pairs === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      houseAnimalZone: true,
      capacity: pairs * 2,
      animalType: 'sheep',
      animalCount: Math.min(countHeldSheep(player), pairs * 2),
      allowedAnimalType: 'sheep',
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D148_DomesticianExpert = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Domestician Expert',
    deck: 'D',
    number: 148,
    desc: ['You can keep 2 <SHEEP> on the border between each pair of orthogonally adjacent rooms.'],
    cost: {},
    players: '4+',
    category: 'FARM_PLANNER',
  },
  impl: cardImpl,
})

export const D148_DomesticianExpert_impl = D148_DomesticianExpert.impl

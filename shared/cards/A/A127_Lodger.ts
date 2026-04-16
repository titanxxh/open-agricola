import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'A127_Lodger'

// A127 Lodger: Provides room for one person until the returning home phase of round 9.
// If by then there is no room elsewhere, remove that person from play.
//
// BGA: onBuy sets hasRoom if round <= 9; computeExtraRoomCapacity +1 while hasRoom;
// onStartReturnHome at round 9: if rooms < familySize, remove one farmer, clear hasRoom.

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round <= 9) {
      writeCardExtraData(player, CARD_ID, 'hasRoom', true)
    }
  },
  computeExtraRoomCapacity: (player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const hasRoom = readCardExtraData<boolean>(player, CARD_ID, 'hasRoom') ?? false
    return hasRoom ? 1 : 0
  },
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (state.round !== 9) return
    const hasRoom = readCardExtraData<boolean>(player, CARD_ID, 'hasRoom') ?? false
    if (!hasRoom) return
    // Check if rooms without Lodger extra capacity < familySize
    const roomsWithoutLodger = player.rooms
    if (roomsWithoutLodger < player.familySize) {
      player.familySize -= 1
      if (player.workersAvailable > 0) {
        player.workersAvailable -= 1
      }
    }
    writeCardExtraData(player, CARD_ID, 'hasRoom', false)
  },
})

export const A127_Lodger = new Occupation({
  id: CARD_ID,
  name: 'Lodger',
  deck: 'A',
  number: 127,
  category: 'FARM_PLANNER',
  desc: ['This card provides room for one person, but only until the returning home phase of round 9. If, by then, there is no room elsewhere for that person, remove it from play.'],
  cost: {},
  players: '3+',
})

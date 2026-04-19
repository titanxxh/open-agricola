import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D85_Reader'

// D85 Reader: once the player has 6+ occupations in play (including this one),
// this card provides room for one person. (Draft-mode 7-occupation variant is not
// modeled here; we follow the default 6-occupation rule.)
registerCardEffect({
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    return player.occupationPlayed.length >= 6 ? 1 : 0
  },
})

export const D85_Reader = new Occupation({
  id: CARD_ID,
  name: 'Reader',
  deck: 'D',
  number: 85,
  category: 'FARM_PLANNER',
  desc: [
    'As soon as you have 6 (__7 in draft mode__) occupations in front of you (including this one), this card provides room for one person.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})

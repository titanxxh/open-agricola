import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C159_FishermansFriend'

// C159 Fisherman's Friend: At the start of each round, if there is more food on the
// Traveling Players than on the Fishing accumulation space, you get the difference.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const travelingPlayers = state.actionSpaces.find((s) => s.id === 'traveling-players')
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    const tpFood = travelingPlayers?.resources?.food ?? 0
    const fishFood = fishing?.resources?.food ?? 0
    const diff = tpFood - fishFood
    if (diff <= 0) return
    return gainLeaf(CARD_ID, { food: diff })
  },
})

export const C159_FishermansFriend = new Occupation({
  id: CARD_ID,
  name: "Fisherman's Friend",
  deck: 'C',
  number: 159,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each round, if there is more <FOOD> on the __Traveling Players__ than on the __Fishing__ accumulation space, you get the difference from the general supply.'],
  cost: {},
  players: '4+',
  newSet: true,
})

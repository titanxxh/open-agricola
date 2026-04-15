import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A141_TurnipFarmer'

// A141 Turnip Farmer: At the start of the returning home phase of each round,
// if both the Day Laborer and Grain Seeds action spaces are occupied, you get 1 vegetable.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const dayLaborer = state.actionSpaces.find((s) => s.id === 'day-laborer')
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!dayLaborer?.takenBy || !grainSeeds?.takenBy) return
    return gainLeaf(CARD_ID, { vegetable: 1 })
  },
})

export const A141_TurnipFarmer = new Occupation({
  id: CARD_ID,
  name: 'Turnip Farmer',
  deck: 'A',
  number: 141,
  category: 'CROP_PROVIDER',
  desc: ['At the start of the returning home phase of each round, if both the __Day Laborer__ and __Grain Seeds__ action spaces are occupied, you get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
  newSet: true,
})

import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B139_ForestScientist'

export const B139_ForestScientist = new Occupation({
  id: CARD_ID,
  name: 'Forest Scientist',
  deck: 'B',
  number: 139,
  category: 'FOOD_PROVIDER',
  desc: ['In the returning home phase of each round, if there is no wood left on the game board, you get 1 <FOOD>—from round 5 on, even 2 <FOOD>.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const B139_ForestScientist_impl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (state, _player) => {
    // Check if any action space has wood on it
    const totalWood = state.actionSpaces.reduce(
      (sum, s) => sum + ((s.resources?.wood ?? 0)),
      0,
    )
    if (totalWood > 0) return
    const amount = state.round >= 5 ? 2 : 1
    return gainLeaf(CARD_ID, { food: amount })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

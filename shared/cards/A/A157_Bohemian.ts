import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'A157_Bohemian'

const LESSONS_SPACES = ['lessons', 'lessons-4']

// A157 Bohemian: At the start of each returning home phase, if at least one Lessons
// action space is unoccupied, you get 1 food.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, _player) => {
    // At least one lessons space must be unoccupied
    const anyUnoccupied = LESSONS_SPACES.some(
      (id) => {
        const space = state.actionSpaces.find((s) => s.id === id)
        return !!space && !isSpaceOccupied(space)
      },
    )
    if (!anyUnoccupied) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
})

export const A157_Bohemian = new Occupation({
  id: CARD_ID,
  name: 'Bohemian',
  deck: 'A',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['At the start of each returning home phase, if at least one __Lessons__ action space is unoccupied, you get 1 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})

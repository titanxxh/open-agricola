import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'E143_Hewer'

// BGA: From round 3 on, at the end of each work phase in which all clay accumulation
// spaces are unoccupied, you get 1 stone and 1 food.
// Clay accumulation spaces: clay-pit (all player counts), hollow-4 (4 players only)
// We use onBeforeReturnHome as the equivalent of BGA's EndWorkPhase.
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, _player) => {
    if (state.round < 3) return

    // Check all clay accumulation spaces are unoccupied
    const claySpaceIds = ['clay-pit']
    // Only check hollow-4 if it exists (4-player games)
    if (state.players.length >= 4) {
      claySpaceIds.push('hollow-4')
    } else if (state.players.length === 3) {
      // 3-player: BGA checks ActionHollow which maps to hollow (3-player clay space)
      // In open-agricola, 3-player uses clay-pit only (hollow is 4-player variant)
      // Actually BGA checks: 4p→Hollow4, 3p→Hollow. Let's check if hollow exists.
      const hollowSpace = state.actionSpaces.find((s) => s.id === 'hollow')
      if (hollowSpace) {
        claySpaceIds.push('hollow')
      }
    }

    const allUnoccupied = claySpaceIds.every((id) => {
      const space = state.actionSpaces.find((s) => s.id === id)
      return !space || !isSpaceOccupied(space)
    })

    if (!allUnoccupied) return

    return gainLeaf(CARD_ID, { stone: 1, food: 1 })
  },
})

export const E143_Hewer = new Occupation({
  id: CARD_ID,
  name: 'Hewer',
  deck: 'E',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'From round 3 on, at the end of each work phase in which all clay accumulation spaces are unoccupied, you get 1 <STONE> and 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
})

import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { E143_Hewer } from '../../cards-display/E/E143_Hewer'

const CARD_ID = E143_Hewer.id

export const E143_Hewer_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

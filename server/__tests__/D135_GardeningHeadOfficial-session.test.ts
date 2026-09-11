import { describe, it } from 'vitest'
import { expectSharedBonuses, setupSharedScoring } from './_helpers/batch07-shared-scoring'

import '../../shared/cards/D/D135_GardeningHeadOfficial'

describe('D135 Gardening Head Official through Session', () => {
  it.each([
    { amounts: [3, 1, 0], expected: [2, 0, 0] },
    { amounts: [2, 2, 1], expected: [2, 2, 0] },
    { amounts: [0, 0, 0], expected: [2, 2, 2] },
  ])('awards every player tied for the most field vegetables: $amounts', ({ amounts, expected }) => {
    const session = setupSharedScoring('D135_GardeningHeadOfficial')
    session.state.players.forEach((player, index) => {
      const amount = amounts[index] ?? 0
      player.fields = amount > 0
        ? [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: amount }] }]
        : []
    })
    session.loadState(session.state)
    expectSharedBonuses(session, 'D135_GardeningHeadOfficial', expected)
  })
})

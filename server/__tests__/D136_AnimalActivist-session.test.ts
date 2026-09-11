import { describe, it } from 'vitest'
import { expectSharedBonuses, setupSharedScoring } from './_helpers/batch07-shared-scoring'

import '../../shared/cards/D/D136_AnimalActivist'

describe('D136 Animal Activist through Session', () => {
  it.each([
    { amounts: [3, 1, 0], expected: [2, 0, 0] },
    { amounts: [2, 2, 1], expected: [2, 2, 0] },
    { amounts: [0, 0, 0], expected: [2, 2, 2] },
  ])('awards every player tied for the most fenced stables: $amounts', ({ amounts, expected }) => {
    const session = setupSharedScoring('D136_AnimalActivist')
    session.state.players.forEach((player, index) => {
      const amount = amounts[index] ?? 0
      player.stableTiles = Array.from({ length: amount }, (_, col) => ({ row: 1, col }))
      player.pastures = amount > 0
        ? [{
            id: `pasture-${index}`, size: amount,
            tiles: Array.from({ length: amount }, (_, col) => ({ row: 1, col })),
            stables: amount, animalType: null, animalCount: 0,
          }]
        : []
    })
    session.loadState(session.state)
    expectSharedBonuses(session, 'D136_AnimalActivist', expected)
  })
})

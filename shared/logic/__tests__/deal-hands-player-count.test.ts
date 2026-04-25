import { describe, expect, it } from 'vitest'
import { cardAllowedForPlayerCount } from '../../cards/player-count-filter'
import { getMinorImprovementCard, getOccupationCard } from '../../cards/catalog'
import { createInitialState } from '../state'

const playerCounts = [1, 2, 3, 4] as const

describe('dealHands — player-count filter (built-in pool)', () => {
  for (const playerCount of playerCounts) {
    it(`every dealt card respects players field at ${playerCount}p`, () => {
      // Sweep many seeds to hit cards with non-trivial players fields.
      for (let seed = 1; seed <= 50; seed += 1) {
        const state = createInitialState(seed, { playerCount })
        for (const player of state.players) {
          for (const id of player.minorHand) {
            const card = getMinorImprovementCard(id)
            expect(
              cardAllowedForPlayerCount(card?.players, playerCount),
              `seed=${seed} player=${player.id} minor=${id} players=${card?.players}`,
            ).toBe(true)
          }
          for (const id of player.occupationHand) {
            const card = getOccupationCard(id)
            expect(
              cardAllowedForPlayerCount(card?.players, playerCount),
              `seed=${seed} player=${player.id} occupation=${id} players=${card?.players}`,
            ).toBe(true)
          }
        }
      }
    })
  }
})

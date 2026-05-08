import { describe, expect, it } from 'vitest'
import { cardAllowedForPlayerCount } from '../../cards/player-count-filter'
import { getMinorImprovementCard, getOccupationCard } from '../../cards/catalog'
import { createInitialState, dealHands } from '../state-bootstrap'
import { MinorImprovement } from '../../cards-display/types'
import { registerAdHocMinorImprovement } from '../../cards/registry-runtime'

const FOUR_PLUS_ID = '__TEST_DEAL_FOURPLUS__'
const NO_RESTRICTION_ID = '__TEST_DEAL_NORESTRICT__'

registerAdHocMinorImprovement(
  new MinorImprovement({
    id: FOUR_PLUS_ID,
    name: 'TestFourPlus',
    deck: 'TEST',
    number: 9001,
    desc: ['test'],
    players: '4+',
  }),
)
registerAdHocMinorImprovement(
  new MinorImprovement({
    id: NO_RESTRICTION_ID,
    name: 'TestNoRestrict',
    deck: 'TEST',
    number: 9002,
    desc: ['test'],
  }),
)

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

describe('dealHands — player-count filter (extra IDs)', () => {
  it('filters a 4+ extra minor id out of a 2p pool', () => {
    let appeared = false
    for (let seed = 1; seed <= 30; seed += 1) {
      const { minorHands } = dealHands(2, seed, [FOUR_PLUS_ID], [])
      if (minorHands.some((h) => h.includes(FOUR_PLUS_ID))) {
        appeared = true
        break
      }
    }
    expect(appeared).toBe(false)
  })

  it('keeps a 4+ extra minor id eligible at 4p', () => {
    let appeared = false
    for (let seed = 1; seed <= 30; seed += 1) {
      const { minorHands } = dealHands(4, seed, [FOUR_PLUS_ID], [])
      if (minorHands.some((h) => h.includes(FOUR_PLUS_ID))) {
        appeared = true
        break
      }
    }
    expect(appeared).toBe(true)
  })

  it('keeps an unrestricted extra minor id at any player count', () => {
    for (const pc of [1, 2, 3, 4]) {
      let appeared = false
      for (let seed = 1; seed <= 100; seed += 1) {
        const { minorHands } = dealHands(pc, seed, [NO_RESTRICTION_ID], [])
        if (minorHands.some((h) => h.includes(NO_RESTRICTION_ID))) {
          appeared = true
          break
        }
      }
      expect(appeared, `playerCount=${pc}`).toBe(true)
    }
  })
})

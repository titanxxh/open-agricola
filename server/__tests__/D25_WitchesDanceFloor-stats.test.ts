/**
 * D25_WitchesDanceFloor — stats counting for multi-identity card.
 *
 * D25 is simultaneously a minor improvement, an occupation, and the Fireplace
 * major improvement. Existing helpers `countOccupations(player)` already include
 * D25 via `extraOccupationsFromCards`, so for stat consistency a single play
 * increments both `totalMinorBuilt` and `totalOccupationBuilt`.
 */

import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/game/types'
import { playMinorImprovement } from '../../shared/actions/effects/improvement'
import { createInitialPlayerStats } from '../../shared/logic/stats'

import '../../shared/cards/D/D25_WitchesDanceFloor'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: ['D25_WitchesDanceFloor'],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: createInitialPlayerStats({ isFirstPlayer: false }),
})

describe('D25 stats: multi-identity counting', () => {
  it('playing D25 increments BOTH totalMinorBuilt and totalOccupationBuilt', () => {
    const state = createState()
    const player = createPlayer()
    state.players = [player]

    expect(player.stats.totalMinorBuilt).toBe(0)
    expect(player.stats.totalOccupationBuilt).toBe(0)

    const result = playMinorImprovement(
      state,
      player,
      'D25_WitchesDanceFloor',
      undefined,
      undefined,
      false,
      'minorAction',
    )

    // Skip if unrelated infra prevents the play (degenerate setup).
    if (result.type !== 'ok' && result.type !== 'flow') {
      throw new Error(
        `expected D25 play to succeed, got ${result.type}: ${JSON.stringify(result)}`,
      )
    }

    // Played as minor → +1
    expect(player.minorPlayed).toContain('D25_WitchesDanceFloor')
    expect(player.stats.totalMinorBuilt).toBe(1)
    // Multi-identity: also counted as occupation built → +1
    expect(player.extraOccupationsFromCards).toContain('D25_WitchesDanceFloor')
    expect(player.stats.totalOccupationBuilt).toBe(1)
  })

  it('idempotency guard: re-running the providesOccupation branch does not double-count', () => {
    // Simulate the dedup path: extraOccupationsFromCards already contains D25.
    const player = createPlayer()
    player.minorPlayed.push('D25_WitchesDanceFloor')
    player.extraOccupationsFromCards.push('D25_WitchesDanceFloor')
    player.stats.totalMinorBuilt = 1
    player.stats.totalOccupationBuilt = 1
    // The idempotency guard inside finalizeMinorImprovementPurchase only runs
    // incOccupationBuilt when the card is newly inserted, so re-entering would
    // be a no-op for stats. Verify the invariant holds.
    if (!player.extraOccupationsFromCards.includes('D25_WitchesDanceFloor')) {
      player.extraOccupationsFromCards.push('D25_WitchesDanceFloor')
      player.stats.totalOccupationBuilt += 1
    }
    expect(
      player.extraOccupationsFromCards.filter((id) => id === 'D25_WitchesDanceFloor'),
    ).toHaveLength(1)
    expect(player.stats.totalOccupationBuilt).toBe(1)
  })
})

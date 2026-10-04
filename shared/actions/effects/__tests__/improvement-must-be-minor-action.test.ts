import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { playMinorImprovement } from '../improvement'

import '../../../cards/D/D025_WitchesDanceFloor'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
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
  minorHand: ['D025_WitchesDanceFloor'],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
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
})

describe('playMinorImprovement — mustBePlayedViaMinorAction', () => {
  it('rejects playing D25 with non-minorAction context (cardEffect)', () => {
    const state = createState()
    const player = createPlayer()

    const result = playMinorImprovement(
      state,
      player,
      'D025_WitchesDanceFloor',
      undefined,
      undefined,
      'cardEffect',
    )

    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('log.minorImprovementRequiresMinorAction')
  })

  it('rejects playing D25 with setup context', () => {
    const state = createState()
    const player = createPlayer()

    const result = playMinorImprovement(
      state,
      player,
      'D025_WitchesDanceFloor',
      undefined,
      undefined,
      'setup',
    )

    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('log.minorImprovementRequiresMinorAction')
  })

  it('does NOT reject D25 with default minorAction context (guard does not block)', () => {
    const state = createState()
    const player = createPlayer()

    // Call with default context — guard should pass, may fail later for unrelated reasons
    const result = playMinorImprovement(
      state,
      player,
      'D025_WitchesDanceFloor',
      undefined,
      undefined,
      'minorAction',
    )

    // The guard-specific rejection must NOT be returned
    const isGuardRejection =
      result.type === 'fail' &&
      result.errorKey === 'log.minorImprovementRequiresMinorAction'
    expect(isGuardRejection).toBe(false)
  })
})

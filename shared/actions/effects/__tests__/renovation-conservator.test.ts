import { describe, expect, it } from 'vitest'

import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'
import { internalActionDefinitions } from '../../internal-actions'
import * as renovationModule from '../renovation'

const createResources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

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

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: createResources(overrides.resources),
  familySize: 2,
  workersAvailable: 2,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

const createSpace = (): ActionSpace => ({
  id: 'test-space',
  nameKey: 'test-space.name',
  descriptionKey: 'test-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: undefined,
  anytime: false,
  resources: createResources(),
  takenBy: null,
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})

const getRenovateHouseToStoneAction = (): ActionDefinition => {
  expect('renovateHouseToStoneAction' in renovationModule).toBe(true)
  return (renovationModule as { renovateHouseToStoneAction: ActionDefinition }).renovateHouseToStoneAction
}

describe('renovate-house-to-stone', () => {
  it('lets wooden houses renovate directly to stone by paying stone per room and one reed', () => {
    const action = getRenovateHouseToStoneAction()
    const state = createState()
    const player = createPlayer({
      resources: createResources({ stone: 2, reed: 1 }),
    })

    expect(internalActionDefinitions.some((candidate) => candidate.id === 'renovate-house-to-stone')).toBe(true)
    expect(action.canBeExecutedByPlayer(state, player)).toBe(true)

    const result = action.execute({
      state,
      player,
      space: createSpace(),
    })

    expect(result).toEqual({ type: 'ok' })
    expect(player.houseType).toBe('stone')
    expect(player.resources.stone).toBe(0)
    expect(player.resources.reed).toBe(0)
  })

  it('rejects direct stone renovation for clay houses', () => {
    const action = getRenovateHouseToStoneAction()
    const state = createState()
    const player = createPlayer({
      houseType: 'clay',
      resources: createResources({ stone: 2, reed: 1 }),
    })

    expect(action.canBeExecutedByPlayer(state, player)).toBe(false)

    const result = action.execute({
      state,
      player,
      space: createSpace(),
    })

    expect(result).toEqual({ type: 'fail', logKey: 'log.renovationFail' })
    expect(player.houseType).toBe('clay')
    expect(player.resources.stone).toBe(2)
    expect(player.resources.reed).toBe(1)
  })
})

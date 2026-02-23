import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../../shared/game/types'
import { runEngineStepsCore } from '../hooks/use-engine-flow'

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
})

const createSpace = (): ActionSpace => ({
  id: 'day-laborer',
  nameKey: 'actions.dayLaborer.name',
  descriptionKey: 'actions.dayLaborer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
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
  takenBy: null,
})

describe('use-engine-flow core', () => {
  it('auto resolves single choice then continues', () => {
    const player = createPlayer()
    const state = createState()
    const space = createSpace()
    let resolveCalled = false
    let stepped = false
    const engine = {
      proceed: () => {
        if (!stepped) {
          stepped = true
          return {
            type: 'choice' as const,
            nodeId: 'n1',
            choice: {
              options: [{ value: 'confirm', labelKey: 'ui.confirm' }],
              promptKey: 'ui.prompt',
            },
          }
        }
        return { type: 'done' as const }
      },
      resolveChoice: () => {
        resolveCalled = true
        return { type: 'ok' as const }
      },
    }

    const result = runEngineStepsCore({
      engine,
      nextState: state,
      player,
      targetSpace: space,
      playerIndex: 0,
      logAction: () => undefined,
      clonePlayer: (snapshot) => ({ ...snapshot, resources: { ...snapshot.resources } }),
    })

    expect(resolveCalled).toBe(true)
    expect(result.type).toBe('done')
  })

  it('returns choice when multiple options exist', () => {
    const player = createPlayer()
    const state = createState()
    const space = createSpace()
    const engine = {
      proceed: () => ({
          type: 'choice' as const,
          nodeId: 'n1',
          choice: {
            options: [
              { value: 'a', labelKey: 'ui.a' },
              { value: 'b', labelKey: 'ui.b' },
            ],
            promptKey: 'ui.prompt',
          },
        }),
      resolveChoice: () => ({ type: 'ok' as const }),
    }

    const result = runEngineStepsCore({
      engine,
      nextState: state,
      player,
      targetSpace: space,
      playerIndex: 0,
      logAction: () => undefined,
      clonePlayer: (snapshot) => ({ ...snapshot, resources: { ...snapshot.resources } }),
    })
    expect(result.type).toBe('choice')
  })

  it('returns reorg when animals increase after ok', () => {
    const player = createPlayer()
    const state = createState()
    const space = createSpace()
    let called = false
    const engine = {
      proceed: () => {
        if (!called) {
          called = true
          player.resources.sheep += 1
          return { type: 'ok' as const, nodeId: 'n1', result: { type: 'ok' as const } }
        }
        return { type: 'done' as const }
      },
      resolveChoice: () => ({ type: 'ok' as const }),
    }

    const result = runEngineStepsCore({
      engine,
      nextState: state,
      player,
      targetSpace: space,
      playerIndex: 0,
      logAction: () => undefined,
      clonePlayer: (snapshot) => ({ ...snapshot, resources: { ...snapshot.resources } }),
    })
    expect(result).toEqual({ type: 'reorg', playerIndex: 0, spaceId: 'day-laborer' })
  })

  it('bubbles fail to caller', () => {
    const player = createPlayer()
    const state = createState()
    const space = createSpace()
    const engine = {
      proceed: () =>
        ({
          type: 'ok' as const,
          nodeId: 'n1',
          result: { type: 'fail' as const, logKey: 'log.someError' },
        }) as const,
      resolveChoice: () => ({ type: 'ok' as const }),
    }

    const result = runEngineStepsCore({
      engine,
      nextState: state,
      player,
      targetSpace: space,
      playerIndex: 0,
      logAction: () => undefined,
      clonePlayer: (snapshot) => ({ ...snapshot, resources: { ...snapshot.resources } }),
    })
    expect(result).toEqual({ type: 'fail', logKey: 'log.someError' })
  })
})

import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../shared/contract/types'
import { serializeState } from '../../../shared/game/serialization'
import { EngineStack } from '../../../shared/engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [
    {
      id: 'test',
      nameKey: 'actions.test.name',
      descriptionKey: 'actions.test.description',
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
      takenBy: [],
    },
  ],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

describe('serializeState contract', () => {
  it('strips function fields from action spaces', () => {
    const state = createState()
    const serialized = serializeState(state, emptyCtx())

    const action = serialized.actionSpaces[0] as Record<string, unknown>
    expect(action.canBeExecutedByPlayer).toBeUndefined()
    expect(action.execute).toBeUndefined()
    expect(action.resolveChoice).toBeUndefined()
    expect(action.flow).toBeUndefined()
    expect(action.id).toBe('test')
    expect(action.nameKey).toBe('actions.test.name')
  })

  it('sets roundStartSnapshot to null', () => {
    const state = createState()
    state.roundStartSnapshot = createState()
    const serialized = serializeState(state, emptyCtx())
    expect(serialized.roundStartSnapshot).toBeNull()
  })
})

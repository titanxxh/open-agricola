import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../../contract/types'
import {
  getLeftBoardActionSpaceId,
  getLeftRoundActionSpaceId,
  getRoundActionSlot,
  getRoundSpaceActionId,
  isRoundSpaceOccupied,
} from '../round-action-topology'

const order = Array.from({ length: 14 }, (_, index) => `round-${index + 1}`)

const player = { id: 'p1' } as PlayerState

const space = (id: string, occupied = false): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: {},
  takenBy: occupied ? [{ playerId: player.id, workerId: '1' }] : [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
} as ActionSpace)

const stateFor = (round: number, occupiedIds: string[] = [], playerCount = 5): GameState => ({
  round,
  currentPlayerIndex: 0,
  players: Array.from({ length: playerCount }, (_, index) => ({ ...player, id: `p${index + 1}` }) as PlayerState),
  actionSpaces: [
    ...order,
    'farm-expansion',
    'forest',
    'grain-seeds',
    'copse-56',
    'lessons-56-2f',
    'farm-supplies-6',
  ].map((id) => space(id, occupiedIds.includes(id))),
  log: [],
  roundActionOrder: [...order],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as unknown as GameState)

describe('round action topology helpers', () => {
  it('maps revealed action ids to round slots and hides unrevealed slots', () => {
    const state = stateFor(5)

    expect(getRoundActionSlot(state, 'round-5')).toEqual({ roundNumber: 5, actionId: 'round-5' })
    expect(getRoundActionSlot(state, 'round-6')).toBeNull()
    expect(getRoundSpaceActionId(state, 5)).toBe('round-5')
    expect(getRoundSpaceActionId(state, 6)).toBeNull()
    expect(getRoundSpaceActionId(state, 0)).toBeNull()
    expect(getRoundSpaceActionId(state, 15)).toBeNull()
  })

  it('returns horizontal left neighbors within the confirmed board rows', () => {
    const state = stateFor(14)

    expect(getLeftRoundActionSpaceId(state, 'round-1')).toBeNull()
    expect(getLeftRoundActionSpaceId(state, 'round-2')).toBe('round-1')
    expect(getLeftRoundActionSpaceId(state, 'round-3')).toBe('round-2')
    expect(getLeftRoundActionSpaceId(state, 'round-4')).toBe('round-3')
    expect(getLeftRoundActionSpaceId(state, 'round-5')).toBeNull()
    expect(getLeftRoundActionSpaceId(state, 'round-6')).toBe('round-5')
    expect(getLeftRoundActionSpaceId(state, 'round-7')).toBe('round-6')
    expect(getLeftRoundActionSpaceId(state, 'round-8')).toBeNull()
    expect(getLeftRoundActionSpaceId(state, 'round-9')).toBe('round-8')
    expect(getLeftRoundActionSpaceId(state, 'round-10')).toBeNull()
    expect(getLeftRoundActionSpaceId(state, 'round-11')).toBe('round-10')
    expect(getLeftRoundActionSpaceId(state, 'round-12')).toBeNull()
    expect(getLeftRoundActionSpaceId(state, 'round-13')).toBe('round-12')
    expect(getLeftRoundActionSpaceId(state, 'round-14')).toBe('round-13')
  })

  it('returns the physical board action immediately left of fixed and round spaces', () => {
    const fivePlayer = stateFor(14)

    expect(getLeftBoardActionSpaceId(fivePlayer, 'round-1')).toBe('farm-expansion')
    expect(getLeftBoardActionSpaceId(fivePlayer, 'farm-expansion')).toBe('copse-56')
    expect(getLeftBoardActionSpaceId(fivePlayer, 'forest')).toBe('grain-seeds')
    expect(getLeftBoardActionSpaceId(fivePlayer, 'round-2')).toBe('round-1')
    expect(getLeftBoardActionSpaceId(fivePlayer, 'lessons-56-2f')).toBeNull()

    const sixPlayer = stateFor(14, [], 6)
    expect(getLeftBoardActionSpaceId(sixPlayer, 'lessons-56-2f')).toBe('farm-supplies-6')
  })

  it('checks occupancy for the action space corresponding to a revealed round slot', () => {
    const state = stateFor(6, ['round-3'])

    expect(isRoundSpaceOccupied(state, 3)).toBe(true)
    expect(isRoundSpaceOccupied(state, 6)).toBe(false)

    state.actionSpaces.find((candidate) => candidate.id === 'round-6')!.takenBy.push({
      playerId: player.id,
      workerId: '2',
    })
    expect(isRoundSpaceOccupied(state, 6)).toBe(true)
  })
})

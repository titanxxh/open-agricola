/**
 * Test fixture factories for common types that tests construct as partials.
 *
 * Each factory fills in the required-but-irrelevant fields so tests only
 * have to specify what they actually care about. Using these removes the
 * `{ id: 'foo' } as any` / `{} as any` pattern that litters test files.
 */
import type {
  ActionDefinition,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../game/types'

const emptyResources = (): Resource => ({
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
})

/**
 * Minimal `ActionSpace` stub keyed by id — nameKey/descriptionKey mirror the
 * id, all optional fields default to no-ops, and resources/takenBy start empty.
 * Callers can override any field via the `partial` argument.
 */
export function mkActionSpace(partial: { id: string } & Partial<ActionSpace>): ActionSpace {
  return {
    id: partial.id,
    nameKey: partial.id,
    descriptionKey: partial.id,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {},
    takenBy: [],
    ...partial,
  }
}

/** Minimal `ActionDefinition` stub. */
export function mkActionDefinition(
  partial: { id: string } & Partial<ActionDefinition>,
): ActionDefinition {
  return {
    id: partial.id,
    nameKey: partial.id,
    descriptionKey: partial.id,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    ...partial,
  }
}

/** A placeholder `ActionFlow` leaf — callers override `actionId` and other fields. */
export function mkFlow(partial: Partial<ActionFlow> & { type?: ActionFlow['type'] } = {}): ActionFlow {
  const type = partial.type ?? 'leaf'
  if (type === 'leaf') {
    return {
      type: 'leaf',
      actionId: 'special-effect',
      ...(partial as Partial<Extract<ActionFlow, { type: 'leaf' }>>),
    }
  }
  if (type === 'playerSwitch') {
    return {
      type: 'playerSwitch',
      targetPlayerId: '',
      ...(partial as Partial<Extract<ActionFlow, { type: 'playerSwitch' }>>),
    }
  }
  return {
    type,
    children: [],
    ...(partial as Partial<Extract<ActionFlow, { type: 'seq' }>>),
  }
}

/** Minimal `PlayerState` stub — id/name required, rest zeroed. */
export function mkPlayerState(partial: { id: string; name?: string } & Partial<PlayerState>): PlayerState {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    color: 'red',
    resources: emptyResources(),
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    improvements: [],
    pastures: [],
    workers: 2,
    workersAvailable: 2,
    familySize: 2,
    minorHand: [],
    occupationHand: [],
    minorPlayed: [],
    occupationPlayed: [],
    cardStates: {},
    begging: 0,
    ...partial,
  } as PlayerState
}

/** Minimal `GameState` stub with a single player. */
export function mkGameState(partial: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    currentPlayerIndex: 0,
    players: [mkPlayerState({ id: 'p1' })],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    ...partial,
  } as GameState
}

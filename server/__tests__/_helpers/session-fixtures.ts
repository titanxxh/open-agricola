import assert from 'node:assert/strict'
import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import type { GameState, InteractionRequest } from '../../../shared/contract/types'
import type { CustomCardData } from '../../../shared/cards/session-card-context'
import { createInitialState, type InitialStateOptions } from '../../../shared/session/state-bootstrap'
import { stabilizeRandomHands } from './stabilize-random-hands'

type FixtureOptions = {
  options?: InitialStateOptions
  customCards?: CustomCardData[]
}

export type SessionFixtureExpectation = {
  phase: GameState['phase']
  roundPhase: GameState['roundPhase']
  interaction: {
    stateId: SessionResponse['interaction']['stateId']
    kind?: InteractionRequest['kind']
    playerIndex?: number
  }
  hands?: Array<{ minorHand: string[]; occupationHand: string[] }>
}

const handsOf = (state: GameState) => state.players.map(({ minorHand, occupationHand }) => ({
  minorHand: [...minorHand], occupationHand: [...occupationHand],
}))

export function assertSessionFixture(session: GameSession, expected: SessionFixtureExpectation): void {
  const response = session.getState()
  assert.equal(response.ok, true, response.error)
  assert.equal(response.state.phase, expected.phase, 'Unexpected fixture phase')
  assert.equal(response.state.roundPhase, expected.roundPhase, 'Unexpected fixture round phase')
  assert.equal(response.interaction.stateId, expected.interaction.stateId, 'Unexpected fixture interaction')
  if (expected.interaction.kind !== undefined) {
    assert.equal(response.interaction.stateId, 'wait', 'Only waiting fixtures have a request')
    assert.ok(response.interaction.stateId === 'wait')
    assert.equal(response.interaction.request.kind, expected.interaction.kind, 'Unexpected fixture request')
  }
  if (expected.interaction.playerIndex !== undefined) {
    assert.ok(response.interaction.stateId === 'wait', 'Only waiting fixtures have an interaction actor')
    assert.equal(response.interaction.playerIndex, expected.interaction.playerIndex, 'Unexpected fixture actor')
  }
  if (expected.hands) assert.deepEqual(handsOf(response.state), expected.hands, 'Fixture hands changed during loading')
}

const fixedOptions = (options: InitialStateOptions = {}): InitialStateOptions => {
  const ordinaryCardDeckSeed = options.ordinaryCardDeckSeed ?? 42
  const parentSelectionSeed = options.parentSelectionSeed ?? 42
  assert.ok(Number.isFinite(ordinaryCardDeckSeed) && Number.isFinite(parentSelectionSeed),
    'Deterministic fixtures require finite deck and parent seeds')
  return { playerCount: 2, ...options, ordinaryCardDeckSeed, parentSelectionSeed }
}

/** Runs the real constructor/setup lifecycle; never consumes an opening choice. */
export function createOpeningSession({
  seed, options, customCards, expected,
}: FixtureOptions & { seed: number | 'random'; expected: SessionFixtureExpectation }): GameSession {
  assert.ok(seed === 'random' || Number.isFinite(seed), 'Choose a finite seed or explicitly use random')
  const session = new GameSession(seed === 'random' ? undefined : seed, customCards,
    seed === 'random' ? { playerCount: 2, ...options } : fixedOptions(options))
  try {
    assert.equal(session.state.players.length, options?.playerCount ?? 2)
    assertSessionFixture(session, expected)
    return session
  } catch (error) {
    session.dispose()
    throw error
  }
}

/** Loads an explicit work scenario. Opening hooks belong in createOpeningSession tests. */
export function createWorkSession({
  seed = 42, options, customCards, configure,
}: FixtureOptions & { seed?: number; configure?: (state: GameState) => void } = {}): GameSession {
  assert.ok(Number.isFinite(seed), 'Work fixtures require a finite seed')
  assert.ok(!options?.enableParentCards, 'Use createOpeningSession for parent setup')
  const state = createInitialState(seed, fixedOptions(options))
  assert.equal(state.phase, 'playing', 'Use createOpeningSession for draft or parent selection')
  stabilizeRandomHands(state.players)
  configure?.(state)
  assert.equal(state.phase, 'playing', 'Work fixtures must start in playing')
  assert.equal(state.roundPhase, 'work', 'Work fixtures must start in work')
  assert.equal(state.draft, null, 'Work fixtures cannot contain an unfinished draft')
  assert.equal(state.parentSelection, null, 'Work fixtures cannot contain unfinished parent selection')
  for (const player of state.players) {
    assert.ok(player.minorHand.length && player.occupationHand.length,
      'Use __test_placeholder__ for irrelevant hands; empty hands are re-dealt')
  }
  const expectedHands = handsOf(state)
  const session = new GameSession(state, customCards)
  try {
    // The public loader rebuilds modifiers and clears cursors before validation.
    session.loadState(state)
    assert.equal(session.state.players.length, options?.playerCount ?? 2)
    assertSessionFixture(session, {
      phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' }, hands: expectedHands,
    })
    return session
  } catch (error) {
    session.dispose()
    throw error
  }
}

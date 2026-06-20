import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import type { ActionDefinition, ActionSpace, Resource } from '../../shared/contract/types'
import { getAdHocAction, registerAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { rehydrateState, serializeState } from '../../shared/session/serialization'

const RECALL_LINKED_TEST_ACTION_ID = 'card_test_recall_linked_block'

if (!getAdHocAction(RECALL_LINKED_TEST_ACTION_ID)) {
  registerAdHocAction({
    id: RECALL_LINKED_TEST_ACTION_ID,
    nameKey: 'actions.recall-placed-worker.name',
    descriptionKey: 'actions.recall-placed-worker.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'recall-placed-worker',
        params: { workerId: '1' },
      },
    }),
  } satisfies ActionDefinition)
}

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.resources.food = 5
    player.occupationHand = ['E105_Pioneer']
    player.minorHand = ['__test_placeholder__']
  })
  session.loadState(state)
  return session
}

const space = (session: GameSession, id: string) =>
  session.getState().state.actionSpaces.find((candidate) => candidate.id === id)!

const addRecallTestSpace = (session: GameSession) => {
  const state = session.getStateForRead()
  state.actionSpaces.push({
    id: RECALL_LINKED_TEST_ACTION_ID,
    nameKey: 'actions.recall-placed-worker.name',
    descriptionKey: 'actions.recall-placed-worker.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {} as Resource,
    takenBy: [],
    blockedBy: [],
  } as ActionSpace)
}

describe('5/6 linked action-space blocking', () => {
  it('blocks the sibling linked space without adding a fake worker', () => {
    const session = setup()

    const resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(space(session, 'copse-56').takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
    expect(space(session, 'lessons-56-2f').takenBy).toEqual([])
    expect(space(session, 'lessons-56-2f').blockedBy).toEqual([
      { playerId: 'p1', workerId: '1', sourceSpaceId: 'copse-56' },
    ])
  })

  it('excludes a blocked linked space from placement choices and rejects direct takeAction', () => {
    const session = setup()
    session.takeAction(0, 'copse-56')

    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const allowed = computeAllowedPlacementSpaces(
      session.getState().state,
      session.getState().state.players[1]!,
    )
    expect(allowed.map((entry) => entry.spaceId)).not.toContain('lessons-56-2f')
    expect(session.getActionAvailability(1)['lessons-56-2f']).toBe(false)

    const resp = session.takeAction(1, 'lessons-56-2f')
    expect(resp.ok).toBe(false)
  })

  it('preserves linked blocks across serialization rehydrate', () => {
    const session = setup()
    session.takeAction(0, 'copse-56')

    const serialized = serializeState(session.getState().state, { engineStack: session.getEngineStack() })
    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state

    expect(restored.actionSpaces.find((candidate) => candidate.id === 'lessons-56-2f')?.blockedBy).toEqual([
      { playerId: 'p1', workerId: '1', sourceSpaceId: 'copse-56' },
    ])
  })

  it('clears linked blocks when workers return home', () => {
    const session = setup()
    session.takeAction(0, 'copse-56')

    ;(session as unknown as { continueReturnHomeHooks: () => void }).continueReturnHomeHooks()

    expect(space(session, 'copse-56').takenBy).toEqual([])
    expect(space(session, 'lessons-56-2f').blockedBy).toEqual([])
  })

  it('clears linked blocks when a placed worker is recalled without adding a sibling worker', () => {
    const session = setup()
    session.takeAction(0, 'copse-56')
    addRecallTestSpace(session)

    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)
    addRecallTestSpace(session)

    const resp = session.takeAction(0, RECALL_LINKED_TEST_ACTION_ID)

    expect(resp.ok).toBe(true)
    expect(space(session, 'copse-56').takenBy).toEqual([])
    expect(space(session, 'lessons-56-2f').takenBy).toEqual([])
    expect(space(session, 'lessons-56-2f').blockedBy).toEqual([])
  })
})

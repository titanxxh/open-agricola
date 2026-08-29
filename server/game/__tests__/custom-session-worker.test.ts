import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'
import { validateAndCompileCustomCode } from '../../custom-code/engine.ts'
import {
  buildSessionSyncPayload,
  createIsolatedGameSession,
  type CustomSessionExecutor,
} from '../custom-session-executor.ts'

const executors: CustomSessionExecutor[] = []

const card = (
  cardId: string,
  listenerBody = 'return undefined',
  listenerAction: string | null = 'collect',
  effectBody = '',
  listenerPhase = 'after',
): CustomCardData => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${cardId}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Worker Card' })
const CARD_IMPL = {
  ${effectBody ? `effect: { id: CARD_ID, ${effectBody} },` : ''}
  listeners: [{
    cardIds: [CARD_ID],
    ${listenerAction ? `actions: ['${listenerAction}'],` : ''}
    phases: ['${listenerPhase}'],
    handler: (context) => { ${listenerBody} },
  }],
}
  `, cardId)
  expect(compiled.valid).toBe(true)
  if (!compiled.valid) throw new Error(compiled.errors.join('; '))
  return {
    cardType: 'minor',
    cardJson: {
      id: cardId,
      name: 'Worker Card',
      deck: 'CUSTOM',
      number: 0,
      desc: [],
    },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
  }
}

const setup = (customCard: CustomCardData, extraCards: CustomCardData[] = []) => {
  const created = createIsolatedGameSession(42, [customCard, ...extraCards], { playerCount: 2 })
  expect(created.executor).toBeDefined()
  const executor = created.executor!
  executors.push(executor)
  const state = created.session.state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.minorPlayed = [customCard.cardJson.id]
  created.session.loadState(state)
  return { ...created, executor }
}

afterEach(() => {
  vi.useRealTimers()
  executors.splice(0).forEach((executor) => executor.dispose())
})

describe('custom session executor', () => {
  it('shares the worker budget between room reservations and HTTP sessions', async () => {
    const customCard = card('CUSTOM_Capacity')
    const rooms = Array.from({ length: 14 }, () => setup(customCard))
    rooms.forEach(({ executor }) => expect(executor.reserveWorkerSlot()).toBe(true))
    const http = setup(customCard)
    expect(http.executor.reserveWorkerSlot()).toBe(true)
    expect((await http.executor.execute('getState', [])).ok).toBe(true)

    const nextRoom = setup(customCard)
    expect(nextRoom.executor.reserveWorkerSlot()).toBe(false)
    expect((await rooms[0]!.executor.execute('getState', [])).ok).toBe(true)
  }, 20_000)

  it('keeps the event loop responsive and rolls back a timed-out command', async () => {
    const { session, executor } = setup(card('CUSTOM_Runaway', 'while (true) {}'))
    const woodBefore = session.state.players[0]!.resources.wood
    const timer = new Promise<'timer'>((resolve) => setTimeout(() => resolve('timer'), 0))
    const command = executor.execute('takeAction', [0, 'forest'])

    expect(await Promise.race([timer, command.then(() => 'command' as const)])).toBe('timer')
    const response = await command

    expect(response.ok).toBe(false)
    expect(response.error).toMatch(/timed out/i)
    expect(session.cardWarnings).toEqual([expect.stringMatching(/timed out/i)])
    expect(session.state.players[0]!.resources.wood).toBe(woodBefore)
    expect(session.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toEqual([])
  }, 20_000)

  it('does not let a timed-out room delay another room', async () => {
    const bad = setup(card('CUSTOM_BadRoom', 'while (true) {}'))
    const good = setup(card('CUSTOM_GoodRoom'))
    await Promise.all([
      bad.executor.execute('getState', []),
      good.executor.execute('getState', []),
    ])

    const stalled = bad.executor.execute('takeAction', [0, 'forest'])
    const healthy = good.executor.execute('takeAction', [0, 'forest'])

    expect(await Promise.race([
      stalled.then(() => 'stalled' as const),
      healthy.then(() => 'healthy' as const),
    ])).toBe('healthy')
    expect((await healthy).ok).toBe(true)
    expect((await stalled).ok).toBe(false)
  }, 20_000)

  it('uses authoritative command settlement for custom-card failures', async () => {
    const { session, executor } = setup(card(
      'CUSTOM_FiniteFailure',
      "throw new Error('finite boom')",
    ))
    const before = JSON.parse(JSON.stringify(session.state))

    const response = await executor.execute('takeAction', [0, 'forest'])

    expect(response.ok).toBe(false)
    expect(response.error).toContain('finite boom')
    expect(JSON.parse(JSON.stringify(session.state))).toEqual(before)
    expect(session.cardWarnings).toEqual([expect.stringContaining('finite boom')])
  })

  it('rejects a query when a custom-card listener emits a warning', async () => {
    const { session, executor } = setup(card(
      'CUSTOM_QueryFailure',
      "if (context.actionId === 'forest') throw new Error('query boom')",
      null,
      '',
      'isDoable',
    ))
    const before = JSON.parse(JSON.stringify(session.state))

    await expect(executor.query('getAvailableActions', [0])).rejects.toThrow('query boom')

    expect(JSON.parse(JSON.stringify(session.state))).toEqual(before)
    expect(session.cardWarnings).toEqual([expect.stringContaining('query boom')])
    expect((await executor.execute('getState', [])).ok).toBe(true)
  })

  it('applies worker snapshots without invoking authoritative loadState', async () => {
    const { session, executor } = setup(card('CUSTOM_NonSettlingMirror'))
    const loadState = vi.spyOn(session, 'loadState').mockImplementation(() => {
      throw new Error('authoritative loadState called')
    })

    expect((await executor.execute('getState', [])).ok).toBe(true)
    expect(loadState).not.toHaveBeenCalled()
  })

  it('restores worker state when dispatch fails after a partial mutation', async () => {
    const { session, executor } = setup(card('CUSTOM_SerializationFailure'))
    const namesBefore = session.state.players.map((player) => player.name)
    expect((await executor.execute('getState', [])).ok).toBe(true)

    const failed = await executor.execute('updatePlayerNames', [[
      [0, 'Mutated'],
      [1, 1n],
    ]])

    expect(failed.ok).toBe(false)
    expect(failed.error).toBe('name.trim is not a function')
    expect(session.state.players.map((player) => player.name)).toEqual(namesBefore)
    const next = await executor.execute('getState', [])
    expect(next.ok).toBe(true)
    expect(next.state.players.map((player) => player.name)).toEqual(namesBefore)
  })

  it('preserves undo history and warnings after a parent-level timeout', async () => {
    const playable: CustomCardData = {
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_Playable',
        name: 'Playable',
        deck: 'CUSTOM',
        number: 1,
        desc: [],
      },
    }
    const { session, executor } = setup(
      card(
        'CUSTOM_UndoAfterFailure',
        'while (true) {}',
        'improvement',
        'computeBonusScore: () => 50',
      ),
      [playable],
    )
    session.state.players[0]!.minorHand = [playable.cardJson.id]
    session.loadState(session.state)
    const played = await executor.execute('takeAction', [0, 'meeting-place'])
    expect(played.ok).toBe(true)
    expect(played.historyLength).toBeGreaterThan(0)
    expect(played.interaction.stateId).toBe('wait')
    const playedPayload = buildSessionSyncPayload(session, played, null, 'debug')
    playedPayload.privateEvents = [{} as never]
    playedPayload.publicEventCancellations = [{} as never]

    vi.useFakeTimers()
    const failedPromise = executor.execute('resolveChoice', [0, 'action-improvement-1'])
    await vi.advanceTimersByTimeAsync(10_000)
    const failed = await failedPromise
    vi.useRealTimers()
    expect(failed.ok).toBe(false)
    expect(failed.error).toBe('custom session command timed out')
    expect(failed.historyLength).toBeGreaterThan(0)
    expect(failed.interaction).toEqual(played.interaction)
    expect(failed.state.players[0]!.minorHand).toContain(playable.cardJson.id)
    expect(session.cardWarnings).toContain('custom session command timed out')
    const failedPayload = buildSessionSyncPayload(session, failed, null, 'debug')
    expect(failedPayload).toMatchObject({
      ok: false,
      error: 'custom session command timed out',
      scores: playedPayload.scores,
      state: playedPayload.state,
      cardWarnings: ['custom session command timed out'],
    })
    expect(failedPayload.privateEvents).toBeUndefined()
    expect(failedPayload.publicEventCancellations).toBeUndefined()

    expect((await executor.execute('undoStep', [])).ok).toBe(true)
  }, 20_000)

  it('serializes commands within one session', async () => {
    const { executor } = setup(card('CUSTOM_Ordered'))
    const action = executor.execute('takeAction', [0, 'forest'])
    const read = executor.execute('getState', [])

    expect((await action).ok).toBe(true)
    const response = await read
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toHaveLength(1)
    expect(executor.scoresForPersistence()).toEqual(response.scores)
  })
})

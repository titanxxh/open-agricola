import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'
import { validateAndCompileCustomCode } from '../../custom-code/engine.ts'
import {
  createIsolatedGameSession,
  type CustomSessionExecutor,
} from '../custom-session-executor.ts'

const executors: CustomSessionExecutor[] = []

const card = (
  cardId: string,
  listenerBody = 'return undefined',
  listenerAction = 'collect',
): CustomCardData => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${cardId}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Worker Card' })
const CARD_IMPL = {
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['${listenerAction}'],
    phases: ['after'],
    handler: () => { ${listenerBody} },
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
  executors.splice(0).forEach((executor) => executor.dispose())
})

describe('custom session executor', () => {
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
  })

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
  })

  it('preserves undo history after a failed custom command', async () => {
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
      card('CUSTOM_UndoAfterFailure', 'while (true) {}', 'improvement'),
      [playable],
    )
    session.state.players[0]!.minorHand = [playable.cardJson.id]
    session.loadState(session.state)
    const played = await executor.execute('takeAction', [0, 'meeting-place'])
    expect(played.ok).toBe(true)
    expect(played.historyLength).toBeGreaterThan(0)
    expect(played.interaction.stateId).toBe('wait')

    const failed = await executor.execute('resolveChoice', [0, 'action-improvement-1'])
    expect(failed.ok).toBe(false)
    expect(failed.historyLength).toBeGreaterThan(0)
    expect(failed.interaction).toEqual(played.interaction)
    expect(failed.state.players[0]!.minorHand).toContain(playable.cardJson.id)

    expect((await executor.execute('undoStep', [])).ok).toBe(true)
  })

  it('serializes commands within one session', async () => {
    const { executor } = setup(card('CUSTOM_Ordered'))
    const action = executor.execute('takeAction', [0, 'forest'])
    const read = executor.execute('getState', [])

    expect((await action).ok).toBe(true)
    expect((await read).state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toHaveLength(1)
  })
})

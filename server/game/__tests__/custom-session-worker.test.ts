import { afterEach, describe, expect, it } from 'vitest'
import type { CustomCardData } from '../../../shared/cards/session-card-context.ts'
import { validateAndCompileCustomCode } from '../../custom-code/engine.ts'
import {
  createIsolatedGameSession,
  type CustomSessionExecutor,
} from '../custom-session-executor.ts'

const executors: CustomSessionExecutor[] = []

const card = (cardId: string, listenerBody = 'return undefined'): CustomCardData => {
  const compiled = validateAndCompileCustomCode(`
const CARD_ID = '${cardId}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Worker Card' })
const CARD_IMPL = {
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['collect'],
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

const setup = (customCard: CustomCardData) => {
  const created = createIsolatedGameSession(42, [customCard], { playerCount: 2 })
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

  it('serializes commands within one session', async () => {
    const { executor } = setup(card('CUSTOM_Ordered'))
    const action = executor.execute('takeAction', [0, 'forest'])
    const read = executor.execute('getState', [])

    expect((await action).ok).toBe(true)
    expect((await read).state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toHaveLength(1)
  })
})

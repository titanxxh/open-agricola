import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { resolveRoomWorkPrompts } from '../../e2e-tests/room-work-driver'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })
const driverFor = (session: GameSession) => {
  sessions.push(session)
  const commands: Array<{ actor: number; type: string; value?: string }> = []
  return {
    commands,
    driver: {
      snapshot: async (actor: number) => session.buildSyncPayload(session.getState(), session.state.players[actor]!.id),
      command: async (actor: number, body: { type: 'getState' } | { type: 'choice'; value: string }) => {
        commands.push({ actor, ...body })
        const response = body.type === 'getState' ? session.getState() : session.resolveChoice(actor, body.value)
        expect(response.ok, response.error).toBe(true)
      },
    },
  }
}

describe('room history work driver', () => {
  it.each([{ seed: 12, owner: 0 }, { seed: 9, owner: 1 }])('resolves real opening choices owned by seat $owner', async ({ seed, owner }) => {
    const session = createOpeningSession({
      seed, options: { deckIds: ['E'] },
      expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait', kind: 'choice', playerIndex: owner } },
    })
    const { driver, commands } = driverFor(session)
    const observed = await driver.snapshot(0)
    expect(observed.interaction).toMatchObject({
      stateId: 'wait', playerIndex: owner, sourceCard: 'E096_Elder',
      request: { kind: owner === 0 ? 'choice' : 'private-prompt' },
    })
    const ready = await resolveRoomWorkPrompts(driver)
    expect(ready.state.roundPhase).toBe('work')
    expect(ready.interaction.stateId).toBe('idle')
    expect(commands).toEqual([
      ...(owner === 1 ? [{ actor: owner, type: 'getState' }] : []),
      { actor: owner, type: 'choice', value: '__skip__' },
    ])
    expect(session.state.players[owner]!.occupationHand).toContain('E096_Elder')
    expect(session.state.players[owner]!.occupationPlayed).not.toContain('E096_Elder')
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(session.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('leaves a work scenario ready without sending commands', async () => {
    const { driver, commands } = driverFor(createWorkSession())
    expect((await resolveRoomWorkPrompts(driver)).interaction.stateId).toBe('idle')
    expect(commands).toEqual([])
  })

  it('does not dismiss an ordinary occupation choice during work', async () => {
    const session = createWorkSession({ configure: state => {
      state.players[0]!.occupationHand = ['E096_Elder', 'A131_CraftTeacher']
    } })
    const { driver, commands } = driverFor(session)
    const before = session.takeAction(0, 'lessons')
    expect(before.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    await expect(resolveRoomWorkPrompts(driver)).rejects.toThrow('choice')
    expect(commands).toEqual([])
    expect(session.getState().interaction).toEqual(before.interaction)
  })
})

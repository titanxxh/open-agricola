import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from './_helpers/session-assertions'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const work = () => {
  const session = createWorkSession({ options: { deckIds: ['A'] }, configure(state) {
    state.players[0]!.occupationHand = ['A095_Angler', 'A124_Knapper']
  } })
  sessions.push(session)
  return session
}

const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

describe('pending observation undo boundaries', () => {
  it.each(['undoStep', 'undoAction'] as const)('%s can return to an action start after disclosure but cannot cross it', command => {
    let session = work()
    session.state.pendingUndoBoundary = true
    assertRejectedUnchanged(session, () => session[command]())
    const before = undoRuleSnapshot(session.getState())

    const action = session.takeAction(0, 'forest')
    expect(action.ok, action.error).toBe(true)
    expect(action.state.pendingUndoBoundary).toBe(false)
    expect(action.state.players[0]!.resources.wood).toBe(3)
    session = restore(session)
    expect(session.getState().interaction.allowedCommands).toContain(command)
    const undone = session[command]()
    expect(undone.ok, undone.error).toBe(true)
    expect(undoRuleSnapshot(undone)).toBe(before)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.publicEventArchive.at(-1)).toMatchObject({ type: 'publicEvents.canceled', reason: command })
    session = restore(session)
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())

    expect(session.takeAction(0, 'clay-pit').ok).toBe(true)
    expect(session[command]().ok).toBe(true)
  })

  it('keeps disclosure during an action irreversible before and after the next choice', () => {
    let session = work()
    const lesson = session.takeAction(0, 'lessons')
    expect(lesson.ok, lesson.error).toBe(true)
    expect(lesson.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    session.state.pendingUndoBoundary = true
    session = restore(session)
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())

    const choice = session.resolveChoice(0, 'A095_Angler')
    expect(choice.ok, choice.error).toBe(true)
    expect(choice.state.pendingUndoBoundary).toBe(false)
    expect(choice.state.players[0]!.occupationPlayed).toContain('A095_Angler')
    session = restore(session)
    expect(session.getState().interaction.allowedCommands).not.toContain('undoStep')
    expect(session.getState().interaction.allowedCommands).not.toContain('undoAction')
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())
  })

  it('does not carry a disclosure boundary into the next player action', () => {
    const session = work()
    session.state.pendingUndoBoundary = true
    confirmNext(session, session.takeAction(0, 'forest'))
    const before = undoRuleSnapshot(session.getState())
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undoRuleSnapshot(undone)).toBe(before)
    expect(undone.state.currentPlayerIndex).toBe(1)
    expect(undone.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
    assertRejectedUnchanged(session, () => session.undoStep())
  })
})

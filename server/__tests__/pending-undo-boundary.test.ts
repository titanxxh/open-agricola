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

  it.each(['C94-stable-cleaner-anytime', 'discard-goods'])(
    'can undo %s after disclosure without starting a turn or crossing the observation', actionId => {
      let session = createWorkSession({ configure(state) {
        const player = state.players[0]!
        player.occupationPlayed = ['C094_StableCleaner']
        Object.assign(player.resources, { wood: 2, food: 2 })
      } })
      sessions.push(session)
      session.state.pendingUndoBoundary = true
      const before = undoRuleSnapshot(session.getState())
      const started = session.takeAnytimeAction(0, actionId)
      expect(started.ok, started.error).toBe(true)
      expect(started.interaction.stateId).toBe('wait')
      session = restore(session)
      const response = session.getState()
      expect(response.interaction.allowedCommands).toContain('undoStep')
      expect(response.historyLength).toBeGreaterThan(0)
      expect(response.hasActionStartSnapshot).toBe(false)
      expect(response.interaction.allowedCommands).not.toContain('undoAction')
      const undone = session.undoStep()
      expect(undone.ok, undone.error).toBe(true)
      expect(undoRuleSnapshot(undone)).toBe(before)
      expect(undone.interaction.stateId).toBe('idle')
      session = restore(session)
      assertRejectedUnchanged(session, () => session.undoStep())
      assertRejectedUnchanged(session, () => session.undoAction())
      expect(session.takeAnytimeAction(0, actionId).ok).toBe(true)
      expect(session.undoStep().ok).toBe(true)
    },
  )

  it('undoes a nested anytime action after disclosure while keeping the older action protected', () => {
    let session = work()
    const lesson = session.takeAction(0, 'lessons')
    expect(lesson.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    session.state.players[0]!.resources.wood = 1
    session.state.pendingUndoBoundary = true
    const before = undoRuleSnapshot(session.getState())
    const pending = JSON.parse(JSON.stringify(session.getState().interaction))
    expect(session.takeAnytimeAction(0, 'discard-goods').ok).toBe(true)
    session = restore(session)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undoRuleSnapshot(undone)).toBe(before)
    expect(undone.interaction).toEqual(pending)
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())
  })

  it('keeps a new disclosure inside an anytime action irreversible', () => {
    let session = work()
    session.state.players[0]!.resources.wood = 2
    expect(session.takeAnytimeAction(0, 'discard-goods').ok).toBe(true)
    session.state.pendingUndoBoundary = true
    session = restore(session)
    assertRejectedUnchanged(session, () => session.undoStep())
    const discarded = session.commitSelectionChoice(0, { resourceCounts: { wood: 1 } })
    expect(discarded.ok, discarded.error).toBe(true)
    expect(discarded.state.players[0]!.resources.wood).toBe(1)
    session = restore(session)
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())
  })

  it('restores completed anytime work step by step without crossing disclosure', () => {
    let session = work()
    session.state.players[0]!.resources.wood = 2
    session.state.pendingUndoBoundary = true
    const before = undoRuleSnapshot(session.getState())
    expect(session.takeAnytimeAction(0, 'discard-goods').ok).toBe(true)
    const discarded = session.commitSelectionChoice(0, { resourceCounts: { wood: 1 } })
    expect(discarded.ok, discarded.error).toBe(true)
    expect(discarded.state.players[0]!.resources.wood).toBe(1)
    session = restore(session)
    const pending = session.undoStep()
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'resource-quantity-select' } })
    session = restore(session)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undoRuleSnapshot(undone)).toBe(before)
    assertRejectedUnchanged(session, () => session.undoStep())
  })

  it('continues a retained anytime selection whose old history lacks an observation marker', () => {
    const original = work()
    original.state.players[0]!.resources.wood = 2
    original.state.pendingUndoBoundary = true
    expect(original.takeAnytimeAction(0, 'discard-goods').ok).toBe(true)
    const snapshot = serializeSessionSnapshot(original.state, original)
    for (const entry of snapshot.sessionCursor.history) delete entry.postObservation
    const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(session)
    assertRejectedUnchanged(session, () => session.undoStep())
    const completed = session.commitSelectionChoice(0, { resourceCounts: { wood: 1 } })
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.players[0]!.resources.wood).toBe(1)
    expect(completed.interaction.stateId).toBe('idle')
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

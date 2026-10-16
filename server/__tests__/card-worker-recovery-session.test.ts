import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createTestDatabase } from './_helpers/postgres'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { snapshotToRoom } from '../game/room'
import { workersAvailable } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization'

const CARD_ID = 'D103_CanalBoatman'
const SPACE_ID = `card-worker:${CARD_ID}`
const sessions: GameSession[] = []

afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const setup = () => {
  const session = createWorkSession({ configure: state => {
    state.round = 3
    state.players[0]!.occupationPlayed = [CARD_ID]
    state.players[0]!.resources.food = 1
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
  } })
  sessions.push(session)
  return session
}

const spendWorker = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'fishing')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.food).toBe(3)
  expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected D103 offer')
  const accept = response.interaction.request.options.find(option => option.value !== '__skip__')!
  response = session.resolveChoice(0, accept.value)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected D103 reward')
  response = session.resolveChoice(0, response.interaction.request.options[0]!.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 3, grain: 0, vegetable: 0 })
  expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  expect(response.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
  return response
}

const snapshotOf = (session: GameSession): PersistedSessionSnapshot =>
  JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))

describe('card-held worker recovery (#1205)', () => {
  it.each(['same-session', 'new-session', 'frame'] as const)('preserves spent workers through %s JSON recovery and ordinary rotation', mode => {
    const original = setup()
    const before = spendWorker(original)
    const saved = snapshotOf(original)
    const savedJson = JSON.stringify(saved)
    const recovered = rehydrateState(mode === 'frame' ? saved.frame : saved)
    const restored = mode === 'same-session' ? original : new GameSession(recovered)
    if (restored !== original) sessions.push(restored)
    else expect(restored.loadState(recovered).ok).toBe(true)

    const response = restored.getState()
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.events).toEqual(before.state.events)
    expect(response.state.log).toEqual(before.state.log)
    expect(response.scores).toEqual(before.scores)
    if (mode !== 'frame') expect(response.interaction).toEqual(before.interaction)
    expect(JSON.stringify(saved)).toBe(savedJson)

    if (mode === 'frame') return
    expect(restored.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(restored.takeAction(1, 'forest').ok).toBe(true)
    const rotated = restored.resolveChoice(1, 'confirm')
    expect(rotated.ok).toBe(true)
    expect(rotated.state.currentPlayerIndex).toBe(1)
    expect(rotated.interaction.stateId).toBe('idle')
    expect(restored.getActionAvailability(0)['day-laborer']).toBe(false)
    const food = restored.state.players[0]!.resources.food
    const rejected = restored.takeAction(0, 'day-laborer')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.food).toBe(food)
    expect(workersAvailable(rejected.state, rejected.state.players[0]!)).toBe(0)
  })

  it('restores ordinary undo and retries the complete action without duplicating payment or reward', () => {
    const original = setup()
    const before = original.getState()
    const originalResources = { ...before.state.players[0]!.resources }
    spendWorker(original)
    const restored = new GameSession(rehydrateState(snapshotOf(original)))
    sessions.push(restored)
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(originalResources)
    expect(workersAvailable(undone.state, undone.state.players[0]!)).toBe(2)
    expect(undone.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy ?? []).toEqual([])
    expect(undone.scores).toEqual(before.scores)
    const retried = spendWorker(restored)
    expect(retried.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(1)
  })

  it('keeps spent workers unavailable until the normal next round', () => {
    const original = setup()
    spendWorker(original)
    const restored = new GameSession(rehydrateState(snapshotOf(original)))
    sessions.push(restored)
    expect(workersAvailable(restored.state, restored.state.players[0]!)).toBe(0)
    expect(restored.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(restored.takeAction(1, 'forest').ok).toBe(true)
    expect(restored.resolveChoice(1, 'confirm').ok).toBe(true)
    expect(restored.takeAction(1, 'day-laborer').ok).toBe(true)
    const next = restored.resolveChoice(1, 'confirm')
    expect(next.ok, next.error).toBe(true)
    expect(next.state.round).toBe(4)
    expect(workersAvailable(next.state, next.state.players[0]!)).toBe(2)
    expect(next.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy).toEqual([])
  })

  it('reconstructs only a noninteractive holder, preserving the complete source ID', () => {
    const original = setup()
    spendWorker(original)
    const saved = snapshotOf(original)
    const holder = saved.state.actionSpaces.find(space => space.id === SPACE_ID)!
    holder.id = 'card-worker:community:author:card'
    holder.takenBy = [{ playerId: 'p1', workerId: '2' }]
    saved.state.actionSpaces.push({ ...holder, id: 'unknown-executable-space' }, { ...holder, id: 'card-worker:' })
    const restored = new GameSession(rehydrateState(saved))
    sessions.push(restored)
    const space = restored.state.actionSpaces.find(entry => entry.id === holder.id)
    expect(space?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
    expect(space?.nameKey).toBe('cards.community:author:card.name')
    expect(restored.state.actionSpaces.some(entry => entry.id === 'unknown-executable-space' || entry.id === 'card-worker:')).toBe(false)
    expect(restored.getState().actionAvailability?.[holder.id]).not.toBe(true)
    expect(restored.resolveChoice(0, 'confirm').ok).toBe(true)
    const before = JSON.stringify(restored.state.players)
    expect(restored.takeAction(1, holder.id).ok).toBe(false)
    expect(JSON.stringify(restored.state.players)).toBe(before)
  })

  it('rebuilds the holder on direct load instead of retaining a caller-provided executable definition', () => {
    const session = setup()
    spendWorker(session)
    const holder = session.state.actionSpaces.find(space => space.id === SPACE_ID)!
    holder.canBeExecutedByPlayer = () => true
    holder.execute = () => { throw new Error('Stored callback must not execute') }
    expect(session.loadState(session.state).ok).toBe(true)
    expect(workersAvailable(session.state, session.state.players[0]!)).toBe(0)
    expect(session.getActionAvailability(1)[SPACE_ID]).toBe(false)
    expect(session.takeAction(0, SPACE_ID).ok).toBe(false)
    expect(session.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
  })

  it('does not create a holder when the effect is declined or no worker remains', () => {
    const declined = setup()
    let response = declined.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    response = declined.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, stone: 0 })
    expect(response.state.actionSpaces.some(space => space.id === SPACE_ID)).toBe(false)

    const noWorker = setup()
    noWorker.state.players[0]!.workers[1]!.isActive = false
    response = noWorker.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, stone: 0 })
    expect(response.state.actionSpaces.some(space => space.id === SPACE_ID)).toBe(false)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('preserves spent workers through PostgreSQL persistence and production room recovery', async () => {
    const original = setup()
    const before = spendWorker(original)
    const db = await createTestDatabase()
    try {
      const persistence = new PostgresRoomPersistence(db)
      await persistence.save('card-worker-recovery', serializeSessionSnapshot(original.state, original), {
        createdBy: null, maxPlayers: 2, customCardDbIds: [], status: 'playing', players: [],
      })
      const saved = await persistence.load('card-worker-recovery')
      expect(saved).not.toBeNull()
      const room = snapshotToRoom(saved!)
      sessions.push(room.session)
      expect(room.snapshotRehydrationFailed).not.toBe(true)
      const response = room.session.getState()
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
      expect(response.state.actionSpaces.find(space => space.id === SPACE_ID)?.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
      expect(response.state.events).toEqual(before.state.events)
      expect(response.state.log).toEqual(before.state.log)
      expect(response.scores).toEqual(before.scores)
      expect(response.interaction).toEqual(before.interaction)
      expect(room.session.resolveChoice(0, 'confirm').ok).toBe(true)
      expect(room.session.takeAction(1, 'forest').ok).toBe(true)
      expect(room.session.resolveChoice(1, 'confirm').ok).toBe(true)
      expect(room.session.state.currentPlayerIndex).toBe(1)
      expect(room.session.getActionAvailability(0)['day-laborer']).toBe(false)
      expect(room.session.takeAction(0, 'day-laborer').ok).toBe(false)
      expect(room.session.state.players[0]!.resources).toMatchObject({ food: 2, stone: 3 })
    } finally { await db.close() }
  })
})

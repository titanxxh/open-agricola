import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { emptyResources } from '../../shared/session/state-bootstrap'
import type { GameState } from '../../shared/contract/types'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C037_DwellingMound'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

const winterSession = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 354, options: { enableThroughTheSeasons: true }, configure: state => {
    state.throughTheSeasons = { startSeason: 'winter', currentSeason: 'winter' }
    state.players.forEach((player, index) => {
      player.resources = { ...emptyResources, food: index === 0 ? 1 : 0 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const restore = (session: GameSession) => {
  const snapshot = serializeSessionSnapshot(session.state, session)
  const recovered = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(recovered)
  expect(recovered.getState().interaction).toEqual(session.getState().interaction)
  expect(recovered.state.events).toEqual(session.state.events)
  expect(recovered.state.log).toEqual(session.state.log)
  expect(recovered.getState().scores).toEqual(session.getState().scores)
  return recovered
}

describe('winter plow payment explanation', () => {
  it('explains the extra food in the same log as the actual payment and plowed field', () => {
    const session = winterSession()
    const other = structuredClone(session.state.players[1])
    const beforeScores = session.getState().scores!
    const entered = session.takeAction(0, 'farmland')
    expect(entered.ok, entered.error).toBe(true)
    expect(entered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(done.state.players[0]!.resources.food).toBe(0)
    expect(done.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
    expect(done.state.players[1]).toEqual(other)
    expect(done.scores![0]!.total).toBe(beforeScores[0]!.total + 1)
    expect(done.scores![1]).toEqual(beforeScores[1])
    expect(done.state.events.filter(event => event.type === 'farm.fieldPlowed')).toEqual([
      expect.objectContaining({ sourceActionId: 'farmland', payment: {
        resources: { food: 1 }, seasonalAdjustments: [{ season: 'winter', resources: { food: 1 } }],
      } }),
    ])
    expect(done.state.events.filter(event => event.type === 'resource.paid' || event.type === 'action.detailLogged')).toHaveLength(0)
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ detailParts: {
        costs: { food: 1 }, effects: { plow: 1 },
        seasonalAdjustments: [{ season: 'winter', resources: { food: 1 } }],
      } }) }),
    ])
    expect(done.state.players.every(player => !Object.keys(player.cardStates).some(id => id.startsWith('through-the-seasons:')))).toBe(true)
  })

  it('rejects a missing food payment before placing a worker or adding a field', () => {
    const session = winterSession(state => { state.players[0]!.resources.food = 0 })
    assertRejectedUnchanged(session, () => session.takeAction(0, 'farmland'))
    expect(session.state.events.filter(event => event.type === 'farm.fieldPlowed' || event.type === 'resource.paid')).toHaveLength(0)
  })

  it.each(['spring', 'disabled'] as const)('does not charge or explain a winter cost in %s', mode => {
    const session = winterSession(state => {
      if (mode === 'spring') state.throughTheSeasons = { startSeason: 'winter', currentSeason: 'spring' }
      else state.enableThroughTheSeasons = false
    })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(1)
    expect(done.state.events.find(event => event.type === 'farm.fieldPlowed')?.payment).toBeUndefined()
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ detailParts: { effects: { plow: 1 } } }) }),
    ])
  })

  it('does not attribute a surcharge canceled by another cost adjustment', () => {
    const session = winterSession()
    session.actionHooks.register({ id: 'test:free-plow-food', actions: ['plow'], phases: ['computeCosts'],
      handler: () => ({ costs: { food: -1 } }) })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(1)
    expect(done.state.events.find(event => event.type === 'farm.fieldPlowed')?.payment).toBeUndefined()
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ detailParts: { effects: { plow: 1 } } }) }),
    ])
  })

  it('separates the winter surcharge from an existing card cost', () => {
    const session = winterSession(state => {
      state.players[0]!.resources.food = 2
      state.players[0]!.minorPlayed = ['C037_DwellingMound']
    })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(0)
    expect(done.state.events.find(event => event.type === 'farm.fieldPlowed')?.payment).toEqual({
      resources: { food: 2 }, seasonalAdjustments: [{ season: 'winter', resources: { food: 1 } }],
    })
    expect(readCardResourceStats(done.state.players[0]!, 'C037_DwellingMound')?.paid).toEqual({ food: 1 })
    expect(Object.keys(done.state.players[0]!.cardStates).some(id => id.startsWith('through-the-seasons:'))).toBe(false)
  })

  it('restores pending and committed facts, rejects an invalid tile, and records exactly one retry after undo', () => {
    let session = winterSession()
    const before = undoRuleSnapshot(session.getState())
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    session = restore(session)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { tile: { row: 0, col: 0 } }))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: { row: 2, col: 0 } }))
    expect(session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } }).ok).toBe(true)
    session = restore(session)
    assertUndoRestored(before, session.undoAction())
    expect(session.state.events.filter(event => event.type === 'farm.fieldPlowed')).toHaveLength(0)
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(0)
    expect(done.state.events.filter(event => event.type === 'farm.fieldPlowed')).toHaveLength(1)
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toHaveLength(1)
  })
})

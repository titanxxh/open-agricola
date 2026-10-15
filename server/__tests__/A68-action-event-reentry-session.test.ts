import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import '../../shared/cards/register-all'

const CARD = 'A068_AsparagusGift'
const STOCK = 'B094_StockProtector'
const BENCH = 'B015_CarpentersBench'
const OUTER = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const INNER = ['H-0-1', 'H-1-1', 'V-0-2']
const sessions = new Set<GameSession>()
afterEach(() => {
  sessions.forEach(session => session.dispose())
  sessions.clear()
})
const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}
const wait = (response: SessionResponse) => {
  ok(response)
  assert.equal(response.interaction.stateId, 'wait')
  expect(response.interaction.playerIndex).toBe(0)
  return response.interaction
}
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = wait(response)
  const option = interaction.request.options?.find(option => option.value === value && !option.disabled)
  assert.ok(option, `Missing ${value}: ${JSON.stringify(interaction)}`)
  return ok(session.resolveChoice(interaction.playerIndex, option.value))
}
const accept = (session: GameSession, response: SessionResponse) => {
  const option = wait(response).request.options?.find(option => !option.value.startsWith('__') && !option.disabled)
  assert.ok(option, JSON.stringify(response.interaction))
  return choose(session, response, option.value)
}
const setup = ({ stock = true, palisades = false, existing = false, owner = 0 }: {
  stock?: boolean; palisades?: boolean; existing?: boolean; owner?: 0 | 1
} = {}) => {
  const session = createWorkSession({ seed: 1194, configure(state) {
    state.round = 4
    const player = state.players[0]!
    state.players[owner]!.minorPlayed = [CARD]
    state.players[owner]!.fields = [{ row: 2, col: 4, stacks: [] }]
    player.minorPlayed.push(BENCH)
    if (palisades) player.minorPlayed.push('B030_WoodPalisades')
    player.occupationPlayed = stock ? [STOCK] : []
    Object.assign(player.resources, { wood: 20, food: 20, vegetable: 0 })
    player.fields = [{ row: 2, col: 4, stacks: [] }]
    if (existing) {
      player.fenceSegments = OUTER.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
    }
    const forest = state.actionSpaces.find(space => space.id === 'forest')
    assert.ok(forest)
    forest.resources.wood = 3
  } })
  sessions.add(session)
  return session
}
const fencePrompt = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let step = 0; step < 4 && wait(current).request.kind === 'select-trigger'; step++) {
    const options = wait(current).request.options ?? []
    const source = options.find(option => option.value === STOCK && !option.disabled)
      ?? options.find(option => option.value === CARD && !option.disabled)
    assert.ok(source, JSON.stringify(current.interaction))
    current = choose(session, current, source.value)
  }
  expect(wait(current).request.kind).toBe('farm-select')
  return current
}
const beginOuter = (session: GameSession) => {
  fencePrompt(session, ok(session.takeAction(0, 'fencing')))
  const response = ok(session.commitSelectionChoice(0, { edges: OUTER }))
  expect(wait(response).request.kind).toBe('select-trigger')
  expect(wait(response).request.options?.filter(option => !option.disabled).map(option => option.value)).toEqual(expect.arrayContaining([CARD, STOCK]))
  return response
}
const beginInner = (session: GameSession, response: SessionResponse) => {
  let current = choose(session, response, STOCK)
  current = accept(session, current)
  current = choose(session, current, 'forest')
  expect(wait(current).sourceCard).toBe(BENCH)
  current = accept(session, current)
  return fencePrompt(session, current)
}
const settle = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let step = 0; step < 4 && wait(current).request.kind === 'select-trigger'; step++) {
    const options = wait(current).request.options ?? []
    const source = options.find(option => option.value === CARD && !option.disabled)
    current = choose(session, current, source?.value ?? '__pass__')
  }
  expect(wait(current).request.kind).toBe('confirm-next-player')
  return current
}
const rewards = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player')
const builds = (response: SessionResponse) => response.state.events.filter(event => event.type === 'farm.fenceBuilt')
const rewardLogs = (response: SessionResponse) => response.state.log.filter(entry => entry.key === 'log.cardEffectGain'
  && entry.params?.cardId === CARD)
const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.add(restored)
  return restored
}
const assertNestedComplete = (response: SessionResponse) => {
  expect(wait(response).request.kind).toBe('confirm-next-player')
  expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, wood: 19, food: 20 })
  expect(builds(response).map(event => event.newFenceEdges)).toEqual([OUTER, INNER])
  expect(rewards(response)).toHaveLength(1)
  expect(rewardLogs(response)).toMatchObject([{ playerId: response.state.players[0]!.id, params: { gain: { vegetable: 1 }, cardId: CARD } }])
}

describe('A068 committed host fence events', () => {
  it.each(['nested-first', 'card-first'])('retains the outer four-fence reward with %s source order', order => {
    const session = setup()
    let outer = beginOuter(session)
    expect(outer.state.players[0]!.resources).toMatchObject({ vegetable: 0, wood: 18 })
    if (order === 'card-first') {
      outer = choose(session, outer, CARD)
      expect(outer.state.players[0]!.resources.vegetable).toBe(1)
    }
    beginInner(session, outer)
    const inner = ok(session.commitSelectionChoice(0, { edges: INNER }))
    const complete = settle(session, inner)
    expect(complete.state.players[0]!.resources).toMatchObject({ vegetable: 1, wood: 19, food: 20 })
    expect(builds(complete).map(event => event.newFenceEdges)).toEqual([OUTER, INNER])
    expect(rewards(complete)).toMatchObject([{ resources: { vegetable: 1 }, actorPlayerId: complete.state.players[0]!.id }])
    expect(rewards(complete)).toHaveLength(1)
    expect(rewardLogs(complete)).toHaveLength(1)
    const final = ok(confirmNextPlayer(session))
    expect(final.state.currentPlayerIndex).toBe(1)
    expect(final.interaction.stateId).toBe('idle')
  })

  it('keeps the ordinary four-fence reward when the extra placement is declined', () => {
    const session = setup()
    const outer = beginOuter(session)
    const declined = choose(session, choose(session, outer, STOCK), '__skip__')
    const complete = settle(session, declined)
    expect(complete.state.players[0]!.resources).toMatchObject({ vegetable: 1, wood: 18, food: 20 })
    expect(builds(complete).map(event => event.newFenceEdges)).toEqual([OUTER])
    expect(rewards(complete)).toHaveLength(1)
    expect(rewardLogs(complete)).toHaveLength(1)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each([
    { name: 'only three ordinary fences beside an existing pasture', fixture: { stock: false, existing: true }, payload: { edges: INNER }, ordinary: 3, wood: 17 },
    { name: 'two ordinary fences and two palisades', fixture: { stock: false, palisades: true }, payload: { edges: ['H-1-0', 'V-0-1'], palisadeEdges: ['H-0-0', 'V-0-0'] }, ordinary: 2, wood: 14 },
    { name: 'another player owning Asparagus Gift', fixture: { stock: false, owner: 1 }, payload: { edges: OUTER }, ordinary: 4, wood: 16 },
  ] as const)('does not reward $name at round four', ({ fixture, payload, ordinary, wood }) => {
    const session = setup(fixture)
    fencePrompt(session, ok(session.takeAction(0, 'fencing')))
    const complete = ok(session.commitSelectionChoice(0, payload))
    expect(wait(complete).request.kind).toBe('confirm-next-player')
    expect(complete.state.players[0]!.resources).toMatchObject({ wood, vegetable: 0 })
    expect(complete.state.players[1]!.resources.vegetable).toBe(0)
    expect(builds(complete).map(event => event.newFenceEdges?.length)).toEqual([ordinary])
    expect(rewards(complete)).toHaveLength(0)
    expect(rewardLogs(complete)).toHaveLength(0)
    const before = JSON.stringify(complete.state)
    for (let read = 0; read < 3; read++) expect(JSON.stringify(ok(session.getState()).state)).toBe(before)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each(['outer-trigger', 'inner-farm'])('restores the %s pending without losing or repeating the outer reward', point => {
    let session = setup()
    let outer = beginOuter(session)
    if (point === 'outer-trigger') {
      session = restore(session)
      outer = ok(session.getState())
    }
    beginInner(session, outer)
    if (point === 'inner-farm') session = restore(session)
    const complete = settle(session, ok(session.commitSelectionChoice(0, { edges: INNER })))
    assertNestedComplete(complete)
    const before = JSON.stringify(complete.state)
    for (let read = 0; read < 3; read++) expect(JSON.stringify(ok(session.getState()).state)).toBe(before)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it('undoes the inner fence commit and repeats it without changing the outer reward', () => {
    const session = setup()
    beginInner(session, beginOuter(session))
    ok(session.commitSelectionChoice(0, { edges: INNER }))
    const undone = ok(session.undoStep())
    expect(wait(undone).request.kind).toBe('farm-select')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 21, vegetable: 0 })
    expect(undone.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(builds(undone).map(event => event.newFenceEdges)).toEqual([OUTER])
    expect(rewards(undone)).toHaveLength(0)
    const complete = settle(session, ok(session.commitSelectionChoice(0, { edges: INNER })))
    assertNestedComplete(complete)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it('undoes the outer reward and grants it once when that source is selected again', () => {
    const session = setup()
    beginInner(session, beginOuter(session))
    const complete = settle(session, ok(session.commitSelectionChoice(0, { edges: INNER })))
    assertNestedComplete(complete)
    const undone = ok(session.undoStep())
    expect(wait(undone).request.kind).toBe('select-trigger')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 19, vegetable: 0 })
    expect(undone.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(builds(undone).map(event => event.newFenceEdges)).toEqual([OUTER])
    expect(rewards(undone)).toHaveLength(0)
    expect(rewardLogs(undone)).toHaveLength(0)
    const redone = settle(session, undone)
    assertNestedComplete(redone)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each([false, true])('undoAction rolls back the whole nested placement chain and permits replay with restore=%s', restored => {
    let session = setup()
    beginInner(session, beginOuter(session))
    assertNestedComplete(settle(session, ok(session.commitSelectionChoice(0, { edges: INNER }))))
    if (restored) session = restore(session)
    const undone = ok(session.undoAction())
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 20, food: 20, vegetable: 0 })
    expect(undone.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(undone.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
    expect(undone.state.actionSpaces.find(space => space.id === 'forest')?.resources.wood).toBe(3)
    expect(builds(undone)).toHaveLength(0)
    expect(rewards(undone)).toHaveLength(0)
    expect(rewardLogs(undone)).toHaveLength(0)
    beginInner(session, beginOuter(session))
    const redone = settle(session, ok(session.commitSelectionChoice(0, { edges: INNER })))
    assertNestedComplete(redone)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })
})

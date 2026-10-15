import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import '../../shared/cards/register-all'

const CARD = 'A073_AgriculturalFertilizers'
const STOCK = 'B094_StockProtector'
const EXISTING = ['H-1-3', 'H-2-3', 'V-1-3', 'V-1-4']
const OUTER = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1']
const ONE = ['H-1-2', 'H-2-2', 'V-1-2']
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
  return ok(session.resolveChoice(0, option.value))
}
const accept = (session: GameSession, response: SessionResponse) => {
  const option = wait(response).request.options?.find(option => !option.value.startsWith('__') && !option.disabled)
  assert.ok(option, JSON.stringify(response.interaction))
  return choose(session, response, option.value)
}
const setup = ({ stock = true, grain = 2, emptyField = true, widePasture = false }: {
  stock?: boolean; grain?: number; emptyField?: boolean; widePasture?: boolean
} = {}) => {
  const session = createWorkSession({ seed: 1196, configure(state) {
    state.round = 10
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.occupationPlayed = stock ? [STOCK] : []
    Object.assign(player.resources, { wood: 20, grain, reed: 0, vegetable: 0 })
    player.fields = [{ row: 0, col: 3, stacks: emptyField ? [] : [{ kind: 'grain', remaining: 3 }] }]
    player.pastures = [{ id: 'existing', tiles: widePasture ? [{ row: 1, col: 3 }, { row: 1, col: 4 }] : [{ row: 1, col: 3 }], animalType: null, animalCount: 0 }]
    const edges = widePasture ? ['H-1-3', 'H-1-4', 'H-2-3', 'H-2-4', 'V-1-3', 'V-1-5'] : EXISTING
    player.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
  } })
  sessions.add(session)
  return session
}
const beforeFence = (session: GameSession) => {
  let response = ok(session.takeAction(0, 'fencing'))
  for (let step = 0; step < 4 && wait(response).request.kind === 'select-trigger'; step++) {
    const options = wait(response).request.options ?? []
    const source = options.find(option => option.value === STOCK && !option.disabled)
      ?? options.find(option => option.value === CARD && !option.disabled)
    assert.ok(source, JSON.stringify(response.interaction))
    response = choose(session, response, source.value)
  }
  expect(wait(response).request.kind).toBe('farm-select')
  return response
}
const beginOuter = (session: GameSession) => {
  beforeFence(session)
  const response = ok(session.commitSelectionChoice(0, { edges: OUTER }))
  expect(wait(response).request.kind).toBe('select-trigger')
  expect(wait(response).request.options?.filter(option => !option.disabled).map(option => option.value))
    .toEqual(expect.arrayContaining([CARD, STOCK]))
  return response
}
const beginStable = (session: GameSession, response: SessionResponse) => {
  let current = response
  if (wait(current).request.kind === 'select-trigger') current = choose(session, current, STOCK)
  expect(wait(current).promptKey).toBe('ui.interactionStockProtectorPlace')
  current = accept(session, current)
  current = choose(session, current, 'farm-expansion')
  if (wait(current).request.kind === 'choice') {
    expect(wait(current).promptKey).toBe('ui.interactionFarmExpansionSelect')
    const stable = wait(current).request.options?.find(option => option.labelKey === 'actions.stables.name')
    assert.ok(stable, JSON.stringify(current.interaction))
    current = choose(session, current, stable.value)
  }
  const interaction = wait(current)
  assert.equal(interaction.request.kind, 'farm-select')
  expect(interaction.request.farm.farmType).toBe('stable')
  return current
}
const finishExpansion = (session: GameSession, response: SessionResponse) =>
  wait(response).promptKey === 'ui.interactionFarmExpansionSelect'
    ? choose(session, response, '__done__') : response
const beginSow = (session: GameSession, response: SessionResponse) => {
  let current = response
  if (wait(current).request.kind === 'select-trigger') current = choose(session, current, CARD)
  expect(wait(current).promptKey).toBe('ui.interactionOptionalAction')
  expect(wait(current).sourceCard).toBe(CARD)
  expect(wait(current).request.options?.some(option => option.labelKey === 'actions.sow.name')).toBe(true)
  current = accept(session, current)
  const interaction = wait(current)
  assert.equal(interaction.request.kind, 'farm-select')
  expect(interaction.request.farm.farmType).toBe('sow')
  return current
}
const commitSow = (session: GameSession) => ok(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 3, crop: 'grain' }] }))
const sow = (session: GameSession, response: SessionResponse) => {
  beginSow(session, response)
  return commitSow(session)
}
const sown = (response: SessionResponse) => response.state.events.filter(event => event.type === 'farm.sown')
const assertSown = (response: SessionResponse, wood = 15) => {
  expect(wait(response).request.kind).toBe('confirm-next-player')
  expect(response.state.players[0]!.resources).toMatchObject({ wood, grain: 1 })
  expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] })
  expect(sown(response)).toMatchObject([{ sourceCardId: CARD, actorPlayerId: response.state.players[0]!.id,
    sows: [{ location: { kind: 'field', playerId: response.state.players[0]!.id, row: 0, col: 3 }, crop: 'grain', added: 3 }] }])
  expect(sown(response)).toHaveLength(1)
  const event = sown(response)[0]
  assert.ok(event?.occurrenceId)
  expect(response.state.log.filter(entry => entry.key === 'log.sow')).toMatchObject([
    { playerId: response.state.players[0]!.id, sourceEvent: { occurrenceId: event.occurrenceId } },
  ])
}
const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.add(restored)
  return restored
}

describe('A073 committed host usage events', () => {
  it.each(['nested-first', 'card-first'])('preserves one outer two-tile Sow with %s source order', order => {
    const session = setup()
    let outer = beginOuter(session)
    expect(outer.state.players[0]!.resources).toMatchObject({ wood: 17, grain: 2 })
    if (order === 'card-first') outer = sow(session, outer)
    beginStable(session, outer)
    const inner = ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] }))
    const returned = finishExpansion(session, inner)
    const complete = order === 'nested-first' ? sow(session, returned) : returned
    assertSown(complete)
    expect(complete.state.events.filter(event => event.type === 'farm.fenceBuilt').map(event => event.newlyUsedTiles)).toEqual([
      [{ playerId: complete.state.players[0]!.id, row: 1, col: 1 }, { playerId: complete.state.players[0]!.id, row: 1, col: 2 }],
    ])
    expect(complete.state.events.filter(event => event.type === 'farm.stableBuilt').map(event => event.newlyUsedTiles)).toEqual([
      [{ playerId: complete.state.players[0]!.id, row: 2, col: 3 }],
    ])
    const next = ok(confirmNextPlayer(session))
    expect(next.state.currentPlayerIndex).toBe(1)
    expect(next.interaction.stateId).toBe('idle')
  })

  it('offers the same Sow when the extra placement is declined', () => {
    const session = setup()
    const declined = choose(session, choose(session, beginOuter(session), STOCK), '__skip__')
    const complete = sow(session, declined)
    assertSown(complete, 17)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it('does not combine an outer one-tile fence with a nested one-tile stable', () => {
    const session = setup()
    beforeFence(session)
    const outer = ok(session.commitSelectionChoice(0, { edges: ONE }))
    beginStable(session, outer)
    const complete = finishExpansion(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })))
    expect(wait(complete).request.kind).toBe('confirm-next-player')
    expect(complete.state.players[0]!.resources).toMatchObject({ wood: 17, grain: 2 })
    expect(sown(complete)).toHaveLength(0)
    expect(complete.state.events.filter(event => event.type === 'farm.fenceBuilt' || event.type === 'farm.stableBuilt')
      .map(event => event.newlyUsedTiles.length)).toEqual([1, 1])
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each([
    { name: 'one newly used tile', fixture: {}, edges: ONE, newlyUsed: 1, wood: 17 },
    { name: 'partitioning an existing pasture', fixture: { widePasture: true }, edges: ['V-1-4'], newlyUsed: 0, wood: 19 },
    { name: 'no seed crop', fixture: { grain: 0 }, edges: OUTER, newlyUsed: 2, wood: 15 },
    { name: 'no empty field', fixture: { emptyField: false }, edges: OUTER, newlyUsed: 2, wood: 15 },
  ])('does not offer a dead or unearned Sow for $name', ({ fixture, edges, newlyUsed, wood }) => {
    const session = setup({ ...fixture, stock: false })
    beforeFence(session)
    const complete = ok(session.commitSelectionChoice(0, { edges }))
    expect(wait(complete).request.kind).toBe('confirm-next-player')
    expect(complete.state.players[0]!.resources).toMatchObject({ wood, grain: fixture.grain ?? 2 })
    expect(complete.state.events.filter(event => event.type === 'farm.fenceBuilt').map(event => event.newlyUsedTiles.length)).toEqual([newlyUsed])
    expect(sown(complete)).toHaveLength(0)
    expect(complete.state.log.filter(entry => entry.key === 'log.sow')).toHaveLength(0)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each([false, true])('requires newly used tiles when constructing stables: two empty tiles=%s', twoNew => {
    const session = setup({ stock: false })
    let response = ok(session.takeAction(0, 'farm-expansion'))
    if (wait(response).request.kind === 'choice') {
      const stable = wait(response).request.options?.find(option => option.labelKey === 'actions.stables.name')
      assert.ok(stable)
      response = choose(session, response, stable.value)
    }
    const interaction = wait(response)
    assert.equal(interaction.request.kind, 'farm-select')
    expect(interaction.request.farm.farmType).toBe('stable')
    response = ok(session.commitSelectionChoice(0, { stables: twoNew ? [{ row: 2, col: 3 }, { row: 2, col: 4 }] : [{ row: 1, col: 3 }] }))
    if (twoNew) {
      response = sow(session, response)
      response = finishExpansion(session, response)
      assertSown(response, 16)
    } else {
      response = finishExpansion(session, response)
      expect(wait(response).request.kind).toBe('confirm-next-player')
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 18 })
      expect(sown(response)).toHaveLength(0)
    }
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt').map(event => event.newlyUsedTiles.length)).toEqual([twoNew ? 2 : 0])
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each(['outer-trigger', 'inner-stable', 'sow-farm'])('preserves the one Sow across %s snapshot restoration', point => {
    let session = setup()
    let outer = beginOuter(session)
    if (point === 'outer-trigger') {
      session = restore(session)
      outer = ok(session.getState())
    }
    beginStable(session, outer)
    if (point === 'inner-stable') session = restore(session)
    const offer = finishExpansion(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })))
    beginSow(session, offer)
    if (point === 'sow-farm') session = restore(session)
    const complete = commitSow(session)
    assertSown(complete)
    const before = JSON.stringify(complete.state)
    for (let read = 0; read < 3; read++) expect(JSON.stringify(ok(session.getState()).state)).toBe(before)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it('can decline the earned Sow without spending grain or offering it again', () => {
    const session = setup()
    beginStable(session, beginOuter(session))
    let offer = finishExpansion(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })))
    if (wait(offer).request.kind === 'select-trigger') offer = choose(session, offer, CARD)
    const complete = choose(session, offer, '__skip__')
    expect(wait(complete).request.kind).toBe('confirm-next-player')
    expect(complete.state.players[0]!.resources.grain).toBe(2)
    expect(sown(complete)).toHaveLength(0)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each(['inner-stable', 'sow'])('undoStep restores the %s selection and replay plants once', point => {
    const session = setup()
    beginStable(session, beginOuter(session))
    let response = ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] }))
    if (point === 'sow') response = sow(session, finishExpansion(session, response))
    const undone = ok(session.undoStep())
    const pending = wait(undone)
    assert.equal(pending.request.kind, 'farm-select')
    expect(pending.request.farm.farmType).toBe(point === 'sow' ? 'sow' : 'stable')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: point === 'sow' ? 15 : 17, grain: 2 })
    expect(undone.state.players[0]!.fields).toContainEqual({ row: 0, col: 3, stacks: [] })
    expect(sown(undone)).toHaveLength(0)
    expect(undone.state.log.filter(entry => entry.key === 'log.sow')).toHaveLength(0)
    if (point === 'inner-stable') {
      expect(undone.state.players[0]!.stableTiles).toHaveLength(0)
      response = ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] }))
      response = sow(session, finishExpansion(session, response))
    } else response = commitSow(session)
    assertSown(response)
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })

  it.each([false, true])('undoAction cancels both placements and Sow before replay with restore=%s', restored => {
    let session = setup()
    beginStable(session, beginOuter(session))
    const inner = ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] }))
    assertSown(sow(session, finishExpansion(session, inner)))
    if (restored) session = restore(session)
    const undone = ok(session.undoAction())
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 20, grain: 2 })
    expect(undone.state.players[0]!.fenceSegments.map(segment => segment.edge)).toEqual(EXISTING)
    expect(undone.state.players[0]!.stableTiles).toHaveLength(0)
    expect(undone.state.players[0]!.fields).toContainEqual({ row: 0, col: 3, stacks: [] })
    expect(undone.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
    expect(undone.state.events.filter(event => event.type === 'farm.fenceBuilt' || event.type === 'farm.stableBuilt' || event.type === 'farm.sown')).toHaveLength(0)
    beginStable(session, beginOuter(session))
    const replayed = ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] }))
    assertSown(sow(session, finishExpansion(session, replayed)))
    expect(ok(confirmNextPlayer(session)).state.currentPlayerIndex).toBe(1)
  })
})

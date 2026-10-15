import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { encodeReplayFrame, decodeReplayFrame } from '../game/replay-codec'

const CARD = 'C179_BovinePioneer'
const STOCK = 'B094_StockProtector'
const NAIL = 'E015_NailBasket'
const outer = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Five players satisfy C179's printed 5+ requirement. Fresh R4 work game,
// fixed placeholder hands, home workers, no occupied action spaces or pastures.
// The Session seam covers paid nested fencing, reaction order and animal housing.
function setup(configure?: (state: GameState) => void) {
  const session = createWorkSession({ options: { playerCount: 5 }, configure: state => {
    state.round = 4
    const player = state.players[0]!
    player.occupationPlayed = [CARD, STOCK]
    player.minorPlayed = [NAIL]
    player.resources.wood = 20
    player.resources.food = 20
    player.resources.stone = 1
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options : []

function choose(session: GameSession, response: SessionResponse, value: string) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait')
  assert.ok(options(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction))
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  assert.equal(next.ok, true, next.error)
  return next
}

function accept(session: GameSession, response: SessionResponse) {
  const offer = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
  assert.ok(offer)
  return choose(session, response, offer.value)
}

function before(session: GameSession, response: SessionResponse) {
  for (let n = 0; n < 5 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger'; n += 1) {
    const source = [CARD, STOCK, '__pass__'].find(value => options(response)
      .some(option => option.value === value && !option.disabled))
    assert.ok(source)
    response = choose(session, response, source)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
    request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
  return response
}

function finish(session: GameSession, response: SessionResponse) {
  for (let n = 0; n < 10; n += 1) {
    assert.equal(response.ok, true, response.error)
    assert.ok(response.interaction.stateId === 'wait')
    if (response.interaction.request.kind === 'confirm-next-player') return response
    if (response.interaction.request.kind === 'animal-reorg') {
      response = houseCattle(session, response)
    } else {
      const source = [CARD, '__pass__', '__skip__'].find(value => options(response)
        .some(option => option.value === value && !option.disabled))
      assert.ok(source, JSON.stringify(response.interaction))
      response = choose(session, response, source)
    }
  }
  throw new Error('Turn did not complete')
}

function houseCattle(session: GameSession, response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg')
  const pasture = response.interaction.request.zones.find(zone => zone.zoneType === 'pasture')
  assert.ok(pasture)
  const zones = response.interaction.request.zones.map(zone => ({ ...zone,
    animalType: zone.id === pasture.id ? 'cattle' : null, animalCount: zone.id === pasture.id ? 1 : 0,
  }))
  const next = session.resolveChoice(0, 'confirm', { zones })
  assert.equal(next.ok, true, next.error)
  expect(next.state.players[0]!.pastures.reduce((sum, pasture) => sum + pasture.animalCount, 0)).toBe(1)
  return next
}

function startOuter(session: GameSession) {
  let response = before(session, session.takeAction(0, 'fencing'))
  response = session.commitSelectionChoice(0, { edges: outer })
  assert.equal(response.ok, true, response.error)
  expect(response.state.players[0]!.resources.cattle).toBe(0)
  return response
}

function enterNested(session: GameSession, response: SessionResponse, rewardFirst = false) {
  if (rewardFirst) response = houseCattle(session, choose(session, response, CARD))
  response = choose(session, response, STOCK)
  response = accept(session, response)
  response = choose(session, response, 'forest')
  response = accept(session, response)
  return before(session, response)
}

function startNested(session: GameSession, rewardFirst = false) {
  return enterNested(session, startOuter(session), rewardFirst)
}

function restore(session: GameSession) {
  const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
  const encoded = encodeReplayFrame({ frame: snapshot, previousFrame: null, stepNo: 0, previousCheckpointStepNo: 0 })
  expect(decodeReplayFrame(null, encoded)).toEqual(snapshot)
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.state.events.slice(0, session.state.events.length)).toEqual(session.state.events)
  return restored
}

describe('C179 committed enclosure facts', () => {
  it.each([false, true])('rewards only the outer new pasture, reward first: %s', rewardFirst => {
    const session = setup()
    let response = startNested(session, rewardFirst)
    response = session.commitSelectionChoice(0, { edges: ['V-0-1'] })
    assert.equal(response.ok, true, response.error)
    expect(response.state.players[0]!.resources.cattle).toBe(rewardFirst ? 1 : 0)
    response = finish(session, response)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 18, food: 20, stone: 0 })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.pastureTilesBeforeFencing).toBeUndefined()
    const fences = response.state.events.filter(event => event.type === 'farm.fenceBuilt')
    expect(fences.map(event => event.newlyEnclosedPastureTiles)).toEqual([
      [0, 1].map(col => ({ playerId: response.state.players[0]!.id, row: 0, col })), [],
    ])
    expect(fences.map(event => event.newlyUsedTiles.length)).toEqual([2, 0])
    expect(fences.map(event => event.newPastures?.length)).toEqual([1, 2])
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.resources.cattle))
      .toMatchObject([{ sourceCardId: CARD, resources: { cattle: 1 }, to: { playerId: response.state.players[0]!.id } }])
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ params: expect.objectContaining({ cardId: CARD }) }),
    ]))
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cattles'))
      .toMatchObject({ quantity: 1, total: 1 })
    for (const viewer of [...response.state.players.map(player => player.id), null]) {
      expect(session.buildSyncPayload(response, viewer).state.events.filter(event => event.type === 'farm.fenceBuilt'))
        .toEqual(fences)
    }
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
  })

  it.each(['partition', 'unfenced-stable', 'multiple-pastures'])('handles %s without confusing enclosure and usage', mode => {
    const session = setup(state => {
      const player = state.players[0]!
      player.occupationPlayed = [CARD]
      player.minorPlayed = []
      if (mode === 'partition') {
        player.fenceSegments = outer.map(edge => ({ edge, type: 'fence' }))
        player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: null, animalCount: 0 }]
      } else if (mode === 'unfenced-stable') player.stableTiles = [{ row: 0, col: 0 }]
    })
    let response = before(session, session.takeAction(0, 'fencing'))
    const edges = mode === 'partition' ? ['V-0-1'] : mode === 'unfenced-stable'
      ? ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
      : [...outer, 'V-0-1']
    response = session.commitSelectionChoice(0, { edges })
    assert.equal(response.ok, true, response.error)
    response = finish(session, response)
    const event = response.state.events.find(event => event.type === 'farm.fenceBuilt')
    assert.ok(event?.type === 'farm.fenceBuilt')
    expect(event.newlyEnclosedPastureTiles).toHaveLength(mode === 'partition' ? 0 : mode === 'unfenced-stable' ? 1 : 2)
    expect(event.newlyUsedTiles).toHaveLength(mode === 'multiple-pastures' ? 2 : 0)
    expect(event.newPastures).toHaveLength(mode === 'unfenced-stable' ? 1 : 2)
    expect(response.state.players[0]!.resources.cattle).toBe(mode === 'partition' ? 0 : 1)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
  })

  it.each(['outer-response', 'inner-selection', 'inner-response'])('restores %s and undoes the inner fence and whole Turn', stop => {
    let session = setup()
    const initial = structuredClone(session.state.players[0])
    let response = startOuter(session)
    if (stop === 'outer-response') session = restore(session)
    response = enterNested(session, session.getState())
    if (stop === 'inner-selection') session = restore(session)
    response = session.commitSelectionChoice(0, { edges: ['V-0-1'] })
    assert.equal(response.ok, true, response.error)
    if (stop === 'inner-response') session = restore(session)
    response = session.undoStep()
    expect(response).toMatchObject({ ok: true, interaction: { stateId: 'wait',
      request: { kind: 'farm-select', farm: { farmType: 'fence' } } } })
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(6)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, stone: 0, cattle: 0 })
    response = session.commitSelectionChoice(0, { edges: ['V-0-1'] })
    response = finish(session, response)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.state.events.filter(event => event.type === 'farm.fenceBuilt')
      .map(event => event.newlyEnclosedPastureTiles.length)).toEqual([2, 0])
    session = restore(session)
    response = session.undoAction()
    assert.equal(response.ok, true, response.error)
    expect(response.state.players[0]).toEqual(initial)
    expect(response.state.events.filter(event => event.type === 'farm.fenceBuilt')).toEqual([])
    response = startNested(session)
    response = session.commitSelectionChoice(0, { edges: ['V-0-1'] })
    response = finish(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 18, stone: 0, cattle: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.resources.cattle)).toHaveLength(1)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
  })

  it('restores animal housing and redoes it without repeating the reward', () => {
    let session = setup()
    let response = startNested(session)
    response = session.commitSelectionChoice(0, { edges: ['V-0-1'] })
    response = choose(session, response, CARD)
    session = restore(session)
    response = houseCattle(session, session.getState())
    response = session.undoStep()
    expect(response).toMatchObject({ ok: true, interaction: { stateId: 'wait', request: { kind: 'animal-reorg' } } })
    response = houseCattle(session, response)
    response = finish(session, response)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.resources.cattle)).toHaveLength(1)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
  })
})

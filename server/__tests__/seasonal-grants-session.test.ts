import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { emptyResources } from '../../shared/session/state-bootstrap'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { getAllTilePositions } from '../../shared/domain/farm'
import '../../shared/cards/B/B077_LoamPit'

const summerSession = (configure?: (state: GameState) => void) => createWorkSession({
  seed: 42,
  options: { playerCount: 2, enableThroughTheSeasons: true },
  configure(state) {
    state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
    for (const player of state.players) {
      player.minorHand = player.occupationHand = ['__test_placeholder__']
      player.resources = { ...emptyResources }
    }
    configure?.(state)
  },
})

const choose = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('expected choice')
  const option = response.interaction.request.options.find(entry => entry.labelKey === labelKey)
  if (!option) throw new Error(`missing choice ${labelKey}`)
  return session.resolveChoice(response.interaction.playerIndex, option.value)
}

const restore = (session: GameSession) => {
  const restored = new GameSession(42, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(structuredClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  expect(response.state.log).toEqual(session.state.log)
  expect(response.scores).toEqual(session.getState().scores)
  session.dispose()
  return restored
}

const buildRooms = (session: GameSession, count = 1) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    response = choose(session, response, 'actions.construct.name')
  }
  expect(response.ok, response.error).toBe(true)
  response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count) })
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('Seasonal grants at the Session boundary', () => {
  it('attributes the actual extra grain to summer in its existing gain result', () => {
    const session = summerSession()
    const other = structuredClone(session.state.players[1])
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 2, grain: 1 })
    expect(response.state.players[1]).toEqual(other)
    const grain = response.state.events.filter(event => event.type === 'resource.moved' && event.resources.grain === 1)
    expect(grain).toEqual([expect.objectContaining({
      type: 'resource.moved', resources: { grain: 1 }, seasonalGrant: { season: 'summer' },
    })])
    expect(response.state.log.filter(entry => entry.key === 'log.actionDetail' &&
      entry.params?.detailParts?.gains?.grain === 1)).toEqual([expect.objectContaining({
      params: expect.objectContaining({ detailParts: { gains: { grain: 1 }, seasonalGrant: { season: 'summer' } } }),
    })])
    expect(Object.keys(response.state.players[0]!.cardStates).filter(id => id.startsWith('through-the-seasons:'))).toEqual([])
    session.dispose()
  })

  it('keeps one summer grant beside a card gain through undo and retry', () => {
    let session = summerSession(state => state.players[0]!.minorPlayed.push('B077_LoamPit'))
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = session.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 2, grain: 1, clay: 3 })
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.seasonalGrant)).toEqual([
        expect.objectContaining({ resources: { grain: 1 }, seasonalGrant: { season: 'summer' } }),
      ])
      expect(response.state.players[0]!.stats?.resourcesFromCards).toEqual({ clay: 3 })
      expect(Object.keys(response.state.players[0]!.cardStates).filter(id => id.startsWith('through-the-seasons:'))).toEqual([])
      session = restore(session)
      const undone = session.undoAction()
      expect(undone.ok, undone.error).toBe(true)
      expect(undone.state.players[0]!.resources).toEqual(emptyResources)
      expect(undone.state.events.filter(event => event.type === 'resource.moved' && event.seasonalGrant)).toEqual([])
      expect(undone.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toEqual([])
    }
    session.dispose()
  })

  it.each(['winter', 'spring', 'autumn', 'disabled'] as const)('does not grant summer grain in %s', season => {
    const session = summerSession(state => {
      if (season === 'disabled') {
        state.enableThroughTheSeasons = false
        state.throughTheSeasons = null
      } else state.throughTheSeasons = { startSeason: season, currentSeason: season }
    })
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 2 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.seasonalGrant)).toEqual([])
    session.dispose()
  })

  it('keeps the free summer stable source through pending recovery and a rejected placement', () => {
    let session = summerSession(state => Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 }))
    const other = structuredClone(session.state.players[1])
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = choose(session, response, 'actions.construct.name')
    }
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    session = restore(session)
    response = choose(session, session.getState(), 'actions.stables.name')
    expect(response.ok, response.error).toBe(true)
    session = restore(session)
    const before = JSON.stringify(session.state)
    expect(session.commitSelectionChoice(0, { stables: [{ row: 1, col: 1 }] }).ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(emptyResources)
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(response.state.players[1]).toEqual(other)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([
      expect.objectContaining({ seasonalGrant: { season: 'summer' }, stables: [{ playerId: 'p1', row: 0, col: 0, kind: 'normal' }] }),
    ])
    expect(response.state.log.filter(entry => entry.params?.detailParts?.effects?.buildStables)).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ detailParts: {
        costs: {}, effects: { buildStables: 1 }, seasonalGrant: { season: 'summer' },
      } }) }),
    ])
    session = restore(session)
    expect(session.state.players[0]!.stableTiles).toHaveLength(1)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, wood: 5, reed: 2 })
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([])
    expect(response.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toEqual([])
    response = choose(session, buildRooms(session), 'actions.stables.name')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(emptyResources)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([
      expect.objectContaining({ seasonalGrant: { season: 'summer' }, stables: [{ playerId: 'p1', row: 0, col: 0, kind: 'normal' }] }),
    ])
    expect(response.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toHaveLength(1)
    session.dispose()
  })

  it.each([
    { rooms: 2, existing: 0, skip: false, expected: 2 },
    { rooms: 2, existing: 3, skip: false, expected: 1 },
    { rooms: 2, existing: 4, skip: false, expected: 0 },
    { rooms: 1, existing: 0, skip: true, expected: 0 },
  ])('records only $expected stables actually granted after $rooms rooms and $existing existing stables', ({ rooms, existing, skip, expected }) => {
    const session = summerSession(state => {
      Object.assign(state.players[0]!.resources, { wood: rooms * 5, reed: rooms * 2 })
      state.players[0]!.stableTiles = Array.from({ length: existing }, (_, col) => ({ row: 0, col }))
    })
    let response = buildRooms(session, rooms)
    if (skip) response = session.resolveChoice(0, '__skip__')
    else if (expected > 0) {
      response = choose(session, response, 'actions.stables.name')
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('expected stable selection')
      response = session.commitSelectionChoice(0, { stables: response.interaction.request.farm.selectableTiles.slice(0, expected) })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(emptyResources)
    expect(response.state.players[0]!.stableTiles).toHaveLength(existing + expected)
    const events = response.state.events.filter(event => event.type === 'farm.stableBuilt')
    expect(events).toHaveLength(expected > 0 ? 1 : 0)
    if (events[0]?.type === 'farm.stableBuilt') {
      expect(events[0].stables).toHaveLength(expected)
      expect(events[0].seasonalGrant).toEqual({ season: 'summer' })
    }
    expect(response.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toHaveLength(expected > 0 ? 1 : 0)
    session.dispose()
  })

  it('omits a summer stable result when the new room fills the last free tile', () => {
    const session = summerSession(state => {
      const player = state.players[0]!
      Object.assign(player.resources, { wood: 5, reed: 2 })
      player.fields = getAllTilePositions().filter(tile =>
        !player.roomTiles.some(room => room.row === tile.row && room.col === tile.col) &&
        !(tile.row === 1 && tile.col === 1)).map(tile => ({ ...tile, stacks: [] }))
    })
    const response = buildRooms(session)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toEqual([])
    expect(response.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toEqual([])
    session.dispose()
  })

  it('keeps ordinary summer stable construction paid and unattributed', () => {
    const session = summerSession(state => { state.players[0]!.resources.wood = 2 })
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = choose(session, response, 'actions.stables.name')
    }
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(emptyResources)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.events.find(event => event.type === 'farm.stableBuilt')).not.toHaveProperty('seasonalGrant')
    expect(response.state.log.filter(entry => entry.params?.detailParts?.seasonalGrant)).toEqual([])
    session.dispose()
  })
})

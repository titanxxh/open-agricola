import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { createOpeningSession } from './_helpers/session-fixtures'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function boundary(playerCount: number, seed: number, configure: (state: GameState) => void, parents = false) {
  const session = createOpeningSession({ seed, options: {
    playerCount, deckIds: ['A'], enableThroughTheSeasons: !parents,
    enableFarmersOfTheMoor: !parents, enableParentCards: parents, draftParents: false,
  }, expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
  sessions.push(session)
  const state = session.getState().state
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources, food: 20, fuel: 3 }
    player.farmTerrain = []
  }
  configure(state)
  const loaded = session.loadState(state)
  expect(loaded.ok, loaded.error).toBe(true)
  expect(loaded.interaction.stateId).toBe('idle')
  return session
}

function pen(player: PlayerState, count: number) {
  player.resources.sheep = count
  player.pastures = [{ id: 'pen', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: 'sheep', animalCount: count }]
  player.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
}

function choose(session: GameSession, response: SessionResponse, labelKey: string) {
  assert.equal(response.interaction.stateId, 'wait')
  assert.equal(response.interaction.request.kind, 'choice')
  const option = response.interaction.request.options.find(item => item.labelKey === labelKey)
  assert.ok(option, `Missing ${labelKey}: ${JSON.stringify(response.interaction)}`)
  const next = session.resolveChoice(0, option.value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function noHarvest(response: SessionResponse, eventCount: number) {
  expect(response.state.events.slice(eventCount).filter(event => event.type.startsWith('harvest.'))).toEqual([])
  expect(response.state.events.slice(eventCount).filter(event => event.type === 'resource.paid')).toEqual([])
  expect(response.state.players[0]!.resources).toMatchObject({ food: 20, fuel: 3 })
  expect(response.state.roundPhase).toBe('work')
}

describe('solo expansion boundaries with two-player controls', () => {
  it.each([
    { playerCount: 1, seed: 9, season: 'spring', wood: 1 },
    { playerCount: 1, seed: 3, season: 'autumn', wood: 3 },
    { playerCount: 2, seed: 9, season: 'spring', wood: 2 },
    { playerCount: 2, seed: 3, season: 'autumn', wood: 4 },
  ])('Forest grants $wood wood in $season at $playerCount players', ({ playerCount, seed, season, wood }) => {
    const session = boundary(playerCount, seed, () => undefined)
    expect(session.state.throughTheSeasons?.currentSeason).toBe(season)
    const other = structuredClone(session.state.players[1])
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(wood)
    expect(response.state.players[1]).toEqual(other)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', actorPlayerId: 'p1',
      resources: { wood }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' } }))
  })

  it.each([1, 2])('spring breeds privately without feeding or heating at %i players', playerCount => {
    const session = boundary(playerCount, 9, state => {
      for (const player of state.players) pen(player, 2)
      state.players[0]!.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    const before = { players: structuredClone(session.state.players), eventCount: session.state.events.length }
    let response = session.takeAction(0, 'season-spring-animal-and-fruit')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', { zones: response.interaction.request.zones.map(zone => ({
        id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'pen' ? 'sheep' : zone.animalType,
        animalCount: zone.id === 'pen' ? 3 : zone.animalCount,
      })) })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    expect(response.state.players[1]).toEqual(before.players[1])
    expect(response.state.events.slice(before.eventCount).filter(event => event.type === 'farm.animalBred'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', animals: { sheep: 1 } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.animalBredFromSource',
      params: expect.objectContaining({ cardId: 'through-the-seasons:spring', resources: { sheep: 1 } }) }))
    noHarvest(response, before.eventCount)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each([1, 2])('autumn reaps private fields without breeding, feeding or heating at %i players', playerCount => {
    const session = boundary(playerCount, 3, state => {
      for (const player of state.players) {
        pen(player, 2)
        player.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
          { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
      }
    })
    const before = { players: structuredClone(session.state.players), eventCount: session.state.events.length }
    let response = choose(session, session.takeAction(0, 'season-autumn-thanksgiving'), 'actions.reap.name')
    assert.equal(response.interaction.stateId, 'wait')
    assert.equal(response.interaction.request.kind, 'choice')
    const done = response.interaction.request.options.find(option => option.value === '__done__' || option.value === '__skip__')
    assert.ok(done)
    response = session.resolveChoice(0, done.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 20, fuel: 3, sheep: 2, grain: 1, vegetable: 1 })
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[], [{ kind: 'vegetable', remaining: 1 }]])
    expect(response.state.players[1]).toEqual(before.players[1])
    expect(response.state.events.slice(before.eventCount).filter(event => event.type === 'farm.animalBred')).toEqual([])
    expect(response.state.events.slice(before.eventCount).filter(event => event.type === 'farm.cropRemoved'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', sourceActionId: 'reap',
        crops: [{ crop: 'grain', amount: 1, location: { kind: 'field', playerId: 'p1', row: 1, col: 1 } }],
        trigger: { phase: 'private-field-phase' } }),
      expect.objectContaining({ actorPlayerId: 'p1', sourceActionId: 'reap',
        crops: [{ crop: 'vegetable', amount: 1, location: { kind: 'field', playerId: 'p1', row: 1, col: 2 } }],
        trigger: { phase: 'private-field-phase' } })])
    expect(response.state.events.slice(before.eventCount)).toContainEqual(expect.objectContaining({ type: 'worker.placed',
      actorPlayerId: 'p1', spaceId: 'season-autumn-thanksgiving' }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.reapDetail', playerId: 'p1', params: expect.objectContaining({ resources: { grain: 1 } }) }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.reapDetail', playerId: 'p1', params: expect.objectContaining({ resources: { vegetable: 1 } }) }))
    noHarvest(response, before.eventCount)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each([1, 2])('spring fence payment records its saving at %i players', playerCount => {
    const session = boundary(playerCount, 9, state => { state.round = 7; state.players[0]!.resources.wood = 10 })
    const before = structuredClone(session.state.players[1])
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const response = session.commitSelectionChoice(0, { edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-1', 'V-0-2'], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(response.state.players[1]).toEqual(before)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', actorPlayerId: 'p1',
      paymentFor: 'fencing', resources: { wood: 5 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }] }))
  })

  it.each([1, 2])('father private draw completes once at %i players', playerCount => {
    const session = boundary(playerCount, 3, state => {
      const player = state.players[0]!
      assert.ok(player.parentCards)
      player.parentCards.father = 'PS03'
      pen(player, 1)
      state.ordinaryCardDecks.minor = ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife', 'A004_Baseboards']
    }, true)
    const other = structuredClone(session.state.players[1])
    let response = session.takeAnytimeAction(0, 'complete-parent-father')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = session.resolveChoice(0, 'PS03:1')
      expect(response.ok, response.error).toBe(true)
    }
    const choices = Object.values(response.state.ordinaryCardDrawChoices)
    expect(choices).toHaveLength(1)
    expect(choices[0]!.candidates).toEqual(['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife'])
    response = session.resolveOrdinaryCardDrawChoice(0, choices[0]!.id, 'A002_ShiftingCultivation')
    expect(response.ok, response.error).toBe(true)
    expect(response.privateEvents).toContainEqual(expect.objectContaining({ type: 'private.handChanged', recipientPlayerId: 'p1',
      sourceCard: 'PS03', cardIds: ['__test_placeholder__', 'A002_ShiftingCultivation'] }))
    expect(response.state.players[0]!.minorHand).toEqual(['__test_placeholder__', 'A002_ShiftingCultivation'])
    expect(response.state.players[0]!.cardStates.PS03?.extraData?.fatherCompletedTier).toBe(1)
    expect(response.state.players[1]).toEqual(other)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, 'complete-parent-father'))
  })

  it.each([1, 2])('father animal reward waits for placement and cannot repeat at %i players', playerCount => {
    const session = boundary(playerCount, 3, state => {
      const player = state.players[0]!
      assert.ok(player.parentCards)
      player.parentCards.father = 'PS09'
      player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    }, true)
    const other = structuredClone(session.state.players[1])
    let response = session.takeAnytimeAction(0, 'complete-parent-father')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = session.resolveChoice(0, 'PS09:1')
    expect(response.ok, response.error).toBe(true)
    assert.equal(response.interaction.stateId, 'wait')
    assert.equal(response.interaction.request.kind, 'animal-reorg')
    response = session.resolveChoice(0, 'confirm', { zones: response.interaction.request.zones.map(zone => ({
      id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'house:2-0' ? 'sheep' : null,
      animalCount: zone.id === 'house:2-0' ? 1 : 0,
    })) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
    expect(response.state.players[0]!.houseAnimals).toEqual({ '2-0': 'sheep' })
    expect(response.state.players[0]!.cardStates.PS09?.extraData?.fatherCompletedTier).toBe(1)
    expect(response.state.players[1]).toEqual(other)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, 'complete-parent-father'))
  })
})

import assert from 'node:assert/strict'
import { afterEach, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { markAllWorkersUsed } from '../../shared/domain/player'

const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function table(configure: (state: GameState) => void, playerCount = 4, moor = false) {
  const session = createWorkSession({ seed: 1631, options: { playerCount, teamConfig: team, enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    state.players[2]!.houseType = 'clay'
    configure(state)
  } })
  expect(session.getState().state.team?.playerTeams).toEqual(playerCount === 4 ? [0, 1, 0, 1] : [0, 1, 2, 0, 1, 2])
  sessions.push(session)
  return session
}
function accept(session: GameSession, initial: SessionResponse) {
  let response = initial
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 3; step++) {
    const options = getChoiceOptions(response)
    if (!options.some(option => option.value === '__skip__') || options.some(option => option.value.startsWith('target-farm:'))) break
    const option = options.find(option => option.value !== '__skip__')
    assert.ok(option)
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

it('Shelter uses the selected teammate one-space pasture and passes to the next ordinary seat', () => {
  const card = 'A001_Shelter'
  const session = table(state => {
    state.players[0]!.minorHand = [card]
    const target = state.players[2]!
    target.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: target.id } }))
    target.pastures = [{ id: 'pasture-1', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
  })
  let response = session.takeAction(0, 'meeting-place')
  for (let step = 0; step < 4; step++) {
    expect(response.ok, response.error).toBe(true)
    const options = getChoiceOptions(response)
    if (response.interaction.promptKey === 'ui.interactionOptionalAction'
      || options.some(option => option.value === 'target-farm:p3')) break
    const option = options.find(option => option.value === card)
      ?? options.find(option => option.value.startsWith('action-improvement-'))
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(0, option.value)
  }
  response = accept(session, response)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [{ value: 'target-farm:p3' }] } })
  expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
  const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.stableTiles).toEqual([])
  expect(built.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
  expect(built.state.players[1]!.minorHand).toContain(card)
  expect(built.state.players[2]!.minorHand).not.toContain(card)
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
})

it('Stable Master grants a one-wood teammate stable even when its owner has used all four stable pieces', () => {
  const card = 'C089_StableMaster'
  const session = table(state => {
    state.players[0]!.occupationHand = [card]
    state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col }))
    state.players[0]!.resources.wood = 1
  })
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationPlayed.includes(card)) response = session.resolveChoice(0, card)
  response = accept(session, response)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [{ value: 'target-farm:p3' }] } })
  response = session.resolveChoice(0, 'target-farm:p3')
  expect(response.ok, response.error).toBe(true)
  const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.stableTiles).toHaveLength(4)
  expect(built.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 2 }])
  expect(session.withCtx(() => computeAnimalZones(session.state.players[2]!, session.state))
    .find(zone => zone.zoneType === 'stable')?.capacity).toBe(1)
  expect(session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
    .find(zone => zone.zoneType === 'stable')?.capacity).toBe(3)
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
  expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'empty')?.total).toBe(-12)
})

it.each([
  { first: 'p3', second: 'p1', wood: 6, remaining: 0 },
  { first: 'p1', second: 'p3', wood: 4, remaining: 0 },
])('Stablehand chooses $second afresh after fencing $first, including restored target selection', ({ first, second, wood, remaining }) => {
  const session = table(state => {
    state.players[0]!.occupationPlayed = ['D089_Stablehand']
    state.players[0]!.resources.wood = wood
  })
  const offered = session.takeAction(0, 'fencing')
  expect(offered.ok, offered.error).toBe(true)
  if (getChoiceOptions(offered).some(option => option.value === `target-farm:${first}`)) {
    expect(session.resolveChoice(0, `target-farm:${first}`).ok).toBe(true)
  } else {
    expect(first).toBe('p1')
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  }
  let response = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  response = accept(session, response)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [
    { value: 'target-farm:p1' }, { value: 'target-farm:p3' },
  ] } })
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const continued = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(continued)
  expect(continued.getState().interaction).toEqual(response.interaction)
  assertRejectedUnchanged(continued, () => continued.resolveChoice(2, `target-farm:${second}`))
  expect(continued.resolveChoice(0, `target-farm:${second}`).ok).toBe(true)
  const built = continued.commitSelectionChoice(0, { stables: [{ row: 0, col: 4 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(remaining)
  const firstIndex = first === 'p1' ? 0 : 2
  const secondIndex = second === 'p1' ? 0 : 2
  expect(built.state.players[firstIndex]!.pastures).toHaveLength(1)
  expect(built.state.players[firstIndex]!.stableTiles).toEqual([])
  expect(built.state.players[secondIndex]!.pastures).toEqual([])
  expect(built.state.players[secondIndex]!.stableTiles).toEqual([{ row: 0, col: 4 }])
  expect(built.state.events.filter(event => event.type === 'farm.fenceBuilt')).toHaveLength(1)
  expect(built.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
  expect(built.scores?.find(score => score.playerId === first)?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
  expect(built.scores?.find(score => score.playerId === second)?.categories.find(category => category.key === 'empty')?.total).toBe(-12)
  const undone = continued.undoStep()
  expect(undone.ok, undone.error).toBe(true)
  expect(undone.state.players[firstIndex]!.pastures).toHaveLength(1)
  expect(undone.state.players[secondIndex]!.stableTiles).toEqual([])
  expect(undone.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
  const redone = continued.commitSelectionChoice(0, { stables: [{ row: 0, col: 4 }] })
  expect(redone.ok, redone.error).toBe(true)
  expect(redone.state.players[0]!.resources.wood).toBe(remaining)
  expect(redone.state.players[secondIndex]!.stableTiles).toEqual([{ row: 0, col: 4 }])
  expect(redone.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
})

it('Fold Builder keeps the visitor fee and sheep with their real players while fencing a teammate farm', () => {
  const session = table(state => {
    state.currentPlayerIndex = 1
    state.players[0]!.occupationPlayed = ['D170_FoldBuilder']
    state.players[1]!.resources.wood = 6
    state.players[1]!.resources.food = 1
  }, 6)
  const offered = session.takeAction(1, 'D170_FoldBuilder')
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.state.players[0]!.resources.food).toBe(1)
  expect(offered.state.players[1]!.resources.food).toBe(0)
  expect(session.resolveChoice(1, 'target-farm:p5').ok).toBe(true)
  let built = session.commitSelectionChoice(1, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  if (built.interaction.stateId === 'wait' && built.interaction.request.kind === 'animal-reorg') {
    assertRejectedUnchanged(session, () => session.resolveChoice(4, 'confirm', { zones: [] }))
    built = session.resolveChoice(1, 'confirm', { zones: built.interaction.request.zones })
  }
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[1]!.resources).toMatchObject({ wood: 0, food: 0, sheep: 1 })
  expect(built.state.players[4]!.resources.sheep).toBe(0)
  expect(built.state.players[4]!.pastures).toHaveLength(1)
  expect(built.state.players[1]!.pastures).toEqual([])
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerFencesBuilt', playerId: 'p2', playerRefs: { owner: 'p5' } }))
  expect(built.scores?.find(score => score.playerId === 'p5')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
})

it('Greenhouse Builder remains available when only the teammate has a legal fencing layout', () => {
  const session = table(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['B171_GreenhouseBuilder']
    owner.resources.wood = 6
    owner.fields = Array.from({ length: 15 }, (_, index) => ({ row: Math.floor(index / 5), col: index % 5, stacks: [] }))
      .filter(tile => !owner.roomTiles.some(room => room.row === tile.row && room.col === tile.col))
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'fencing'
  }, 6)
  expect(session.getAvailableActions(0).map(action => action.spaceId)).toContain('B171_GreenhouseBuilder')
  const offered = session.takeAction(0, 'B171_GreenhouseBuilder')
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [{ value: 'target-farm:p4' }] } })
  expect(session.resolveChoice(0, 'target-farm:p4').ok).toBe(true)
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.pastures).toEqual([])
  expect(built.state.players[3]!.pastures).toHaveLength(1)
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerFencesBuilt', playerId: 'p1', playerRefs: { owner: 'p4' } }))
})

it('Building Plan starts a new target scope for two free stables after two teammate rooms in Moor', () => {
  const session = table(state => {
    for (const player of state.players) player.farmTerrain = []
    state.players[0]!.minorPlayed = ['M037_BuildingPlan']
    state.players[0]!.resources.clay = 12
    state.players[0]!.resources.reed = 6
  }, 4, true)
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
  let response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] })
  response = accept(session, response)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice', options: [
    { value: 'target-farm:p1' }, { value: 'target-farm:p3' },
  ] } })
  expect(session.resolveChoice(0, 'target-farm:p1').ok).toBe(true)
  const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }, { row: 0, col: 3 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, wood: 0 })
  expect(built.state.players[0]!.rooms).toBe(2)
  expect(built.state.players[0]!.stableTiles).toHaveLength(2)
  expect(built.state.players[2]!.rooms).toBe(4)
  expect(built.state.players[2]!.stableTiles).toEqual([])
  expect(built.state.log.filter(entry => entry.key === 'log.partnerRoomsBuiltClay')).toHaveLength(1)
  expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'clayRooms')?.total).toBe(4)
})

it.each([4, 5])('Carpenter Bench limits partner fencing including its surcharge to the %i wood just collected', amount => {
  const session = table(state => {
    state.players[0]!.minorPlayed = ['B015_CarpentersBench']
    state.players[0]!.resources.wood = 9
    const forest = state.actionSpaces.find(space => space.id === 'forest')
    assert.ok(forest)
    forest.resources.wood = amount
  })
  let response = accept(session, session.takeAction(0, 'forest'))
  const target = getChoiceOptions(response).find(option => option.value === 'target-farm:p3')
  expect(!!target).toBe(amount === 5)
  if (target) response = session.resolveChoice(0, target.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(amount === 5 ? 9 : 10)
  expect(built.state.players[amount === 5 ? 2 : 0]!.pastures).toHaveLength(1)
  expect(built.state.log.filter(entry => entry.key === 'log.partnerFencesBuilt')).toHaveLength(amount === 5 ? 1 : 0)
})

it.each([2, 3])('Master Fencer pays its %i-wood card price before the protected partner surcharge at the real round start', paid => {
  const card = 'E088_MasterFencer'
  const session = table(state => {
    state.round = 2
    for (const player of state.players) markAllWorkersUsed(state, player)
    state.players[0]!.occupationPlayed = [card]
    state.players[0]!.houseType = 'stone'
    state.players[0]!.resources.wood = paid === 2 ? 3 : 5
    if (paid === 2) {
      const target = state.players[2]!
      target.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: target.id } }))
      target.pastures = [{ id: 'pasture-1', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    }
  })
  let response = session.performRoundEnd()
  for (let step = 0; step < 12; step++) {
    expect(response.ok, response.error).toBe(true)
    assert.ok(response.interaction.stateId === 'wait')
    const request = response.interaction.request
    const options = getChoiceOptions(response)
    if (options.some(option => option.value === 'target-farm:p3')) break
    if (request.kind === 'confirm-player-switch' || request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      continue
    }
    const option = options.find(option => option.effectPreview?.resourcesPaid?.wood === paid)
      ?? options.find(option => option.value === card || option.labelKey === 'actions.activate-card-effect.name')
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  expect(response.state.round).toBe(3)
  expect(session.resolveChoice(0, 'target-farm:p3').ok).toBe(true)
  const edges = paid === 2 ? ['H-0-3', 'H-1-3', 'V-0-4'] : ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3']
  const built = session.commitSelectionChoice(0, { edges })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.fenceSegments).toEqual([])
  expect(built.state.players[2]!.fenceSegments).toHaveLength(paid === 2 ? 7 : 4)
  expect(built.state.players[2]!.resources.wood).toBe(0)
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerFencesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
})

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, serializeState, rehydrateState } from '../../shared/session/serialization'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { computeAnimalZones, buildCardAnimalZoneId } from '../../shared/domain/animal-zones'
import { getWorkPhaseBuildingResources } from '../../shared/session/work-phase-resources'
import { addFarmyardExtension } from '../../shared/domain/farmyard-extensions'
import { Scoring } from '../../shared/domain/scoring'
import { type MoorSpecialActionId } from '../../shared/moor/types'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { expectWait } from './_helpers/trigger-select'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD = 'A040_PottersYard'

const original = ['0-3', '0-4', '1-4', '2-3', '2-4']

const tokens = (state: GameState, index = 0) => (state.players[index]!.farmyardSpaceStates ?? [])
  .filter(token => token.sourceCardId === CARD && token.kind === 'farmyard-goods-token')

const keys = (state: GameState, index = 0) => tokens(state, index).map(token => token.spaceKey).sort()

const options = (response: SessionResponse) => response.interaction.stateId === 'wait' ? getChoiceOptions(response) ?? [] : []

function selection(response: SessionResponse) {
  const request = expectWait(response).interaction.request
  assert.ok(request.kind === 'selection', JSON.stringify(request))
  return request.selection
}

function choose(session: GameSession, response: SessionResponse, value: string) {
  const option = options(response).find(option => option.value === value)
  if (value !== 'confirm') expect(option, JSON.stringify(response.interaction)).toBeDefined()
  expect(option?.disabled).not.toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function setup(configure?: (state: GameState) => void, moor = true) {
  const session = sessionEvidence.track(createWorkSession({ options: { enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
    state.round = 3
    const player = state.players[0]!
    player.minorHand = [CARD, '__test_placeholder__']
    Object.assign(player.resources, { wood: 20, reed: 10, clay: 0, stone: 20, food: 20, fuel: 20 })
    if (!moor) player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
    configure?.(state)
  } }))

  return session
}

function play(session: GameSession, card = CARD, space = 'major-improvement') {
  let response = session.takeAction(0, space)
  expect(response.ok, response.error).toBe(true)
  const branch = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = choose(session, response, branch.value)
  if (options(response).some(option => option.value === card)) response = choose(session, response, card)
  if (card === 'M017_Reforestation') expect(response.state.players[1]!.minorHand).toContain(card)
  else expect(response.state.players[0]!.minorPlayed).toContain(card)
  return response
}

function nextTurn(session: GameSession, response: SessionResponse, opponentSpace = 'day-laborer') {
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  response = choose(session, response, 'confirm')
  if (response.state.currentPlayerIndex === 1) {
    response = session.takeAction(1, opponentSpace)
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
  }
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

function restore(session: GameSession) {
  const restored = sessionEvidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))))

  return restored
}

function skipExchange(session: GameSession, response: SessionResponse) {
  if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
  if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
  return response
}

function exchangeWindow(session: GameSession, response: SessionResponse) {
  for (let count = 0; count < 4 && options(response).some(option => option.value === CARD); count++) response = choose(session, response, CARD)
  expect(options(response).some(option => option.value === '__skip__'), JSON.stringify(response.interaction)).toBe(true)
  return response
}

function accept(session: GameSession, response: SessionResponse) {
  const option = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
  if (!option) throw new Error(`Expected an enabled offer: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}

function special(session: GameSession, action: MoorSpecialActionId, tile: { row: number; col: number }) {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes(action))
  expect(card).toBeDefined()
  const response = session.takeSpecialAction(0, card!.id, action, { tile })
  expect(response.ok, response.error).toBe(true)
  return response
}

function threeWorkers(state: GameState) {
  const player = state.players[0]!
  player.rooms = 3
  player.roomTiles.push({ row: 0, col: 3 })
  setActiveWorkerCount(player, 3)
  setWorkersAtHome(state, player, 3)
}

describe('A040 original clay positions', () => {
  it('does not replenish clay when Lumber Pile returns a stable and fencing reuses the same space', () => {
    const session = setup(state => {
      state.round = 4
      const player = state.players[0]!
      player.rooms = 4
      player.roomTiles.push({ row: 0, col: 0 }, { row: 0, col: 1 })
      setActiveWorkerCount(player, 4)
      setWorkersAtHome(state, player, 4)
      player.minorHand.push('E076_LumberPile')
    }, false)
    const originalPositions = ['0-2', '1-1', '1-2', '2-1', '2-2']
    const remainingPositions = ['1-1', '1-2', '2-1', '2-2']
    let response = play(session)
    expect(keys(response.state)).toEqual(originalPositions)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, reed: 9, clay: 0 })
    nextTurn(session, response)
    response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    const buildStable = options(response).find(option => option.labelKey === 'actions.stables.name')
    expect(buildStable).toBeDefined()
    response = choose(session, response, buildStable!.value)
    expect(expectWait(response).interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    response = skipExchange(session, exchangeWindow(session, response))
    response = choose(session, response, '__done__')
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 17, clay: 1, food: 20 })
    expect(keys(response.state)).toEqual(remainingPositions)
    nextTurn(session, response, 'forest')
    response = play(session, 'E076_LumberPile', 'meeting-place')
    expect(response.state.players[0]!.resources.wood).toBe(17)
    response = accept(session, response)
    expect(selection(response).kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(getUsedFarmyardTileKeys(response.state.players[0]!).has('0-2')).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 20, clay: 1, food: 20 })
    expect(keys(response.state)).toEqual(remainingPositions)
    nextTurn(session, response)
    response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
    expect(response.ok, response.error).toBe(true)
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.pastures.map(pasture => pasture.tiles)).toEqual([[{ row: 0, col: 2 }]])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 16, clay: 1, food: 20 })
    expect(keys(response.state)).toEqual(remainingPositions)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player' && event.resources.clay === 1)).toHaveLength(1)
    expect(response.state.log.filter(entry => entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD)).toHaveLength(1)
  })

  it.each([CARD, 'M096_FallowLand'])('keeps co-located sources and the other owner separate with %s first', first => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = ['M096_FallowLand', 'M111_NoTillFarming', 'B015_CarpentersBench']
      player.farmyardSpaceStates = [{ spaceKey: '0-3', sourceCardId: 'M096_FallowLand', kind: 'farmyard-goods-token', resources: { food: 1 }, claimPolicy: 'when-no-longer-unused' }]
      const opponent = state.players[1]!
      opponent.minorPlayed = [CARD]
      opponent.farmyardSpaceStates = [{ spaceKey: '0-3', sourceCardId: CARD, kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' }]
    })
    nextTurn(session, play(session))
    const opponent = JSON.stringify(session.state.players[1])
    session.takeAction(0, 'farmland')
    let response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(options(response).filter(option => [CARD, 'M096_FallowLand'].includes(option.value))).toHaveLength(2)
    response = choose(session, response, first)
    for (let step = 0; step < 8 && expectWait(response).interaction.request.kind !== 'confirm-next-player'; step++) {
      if (options(response).some(option => option.value === '__skip__') && expectWait(response).interaction.request.kind !== 'select-trigger') response = choose(session, response, '__skip__')
      else if (options(response).some(option => option.value === 'M096_FallowLand')) response = choose(session, response, 'M096_FallowLand')
      else response = choose(session, response, CARD)
    }
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 21 })
    expect(response.state.players[0]!.farmyardSpaceStates?.filter(token => token.spaceKey === '0-3')).toEqual([])
    expect(JSON.stringify(response.state.players[1])).toEqual(opponent)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.to.kind === 'player' && event.sourceCardId === CARD && event.resources.clay === 1)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.to.kind === 'player' && event.sourceCardId === 'M096_FallowLand' && event.resources.food === 1)).toHaveLength(1)
  })

  it('derives an empty resource display from the last token without changing unused scoring', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.fields = [0, 1, 2].flatMap(row => [0, 1, 2, 3, 4].map(col => ({ row, col, stacks: [] })))
        .filter(tile => !(tile.row === 0 && tile.col === 2) && !player.roomTiles.some(room => room.row === tile.row && room.col === tile.col))
    }, false)
    const emptyBefore = session.withCtx(() => Scoring.breakdown(session.state, 0)).categories.find(category => category.key === 'empty')?.total
    let response = play(session)
    expect(keys(response.state)).toEqual(['0-2'])
    expect(session.withCtx(() => Scoring.breakdown(response.state, 0)).categories.find(category => category.key === 'empty')?.total).toBe(emptyBefore)
    expect(emptyBefore).toBe(-1)
    nextTurn(session, response)
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    response = skipExchange(session, exchangeWindow(session, response))
    expect(keys(response.state)).toEqual([])
    expect(session.withCtx(() => serializeState(response.state, { actionHooks: session.actionHooks })).players[0]!.cardStatePresentation[CARD]?.resourceGroups).toEqual([])
    expect(session.withCtx(() => Scoring.breakdown(response.state, 0)).categories.find(category => category.key === 'empty')?.total).toBe(0)
  })

  it('never borrows original unused-space clay after a starting forest is cleared and plowed', () => {
    const session = setup()
    nextTurn(session, play(session))
    expect(session.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 0, kind: 'forest' })
    const response = nextTurn(session, special(session, 'fell-trees', { row: 0, col: 0 }), 'clay-pit')
    expect(response.state.players[0]!.resources.clay).toBe(0)
    session.takeAction(0, 'farmland')
    const plowed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(plowed.ok, plowed.error).toBe(true)
    expect(keys(plowed.state)).toEqual(original)
    expect(plowed.state.players[0]!.resources.clay).toBe(0)
    expect(expectWait(plowed).interaction.request.kind).toBe('confirm-next-player')
  })

  it('offers Wolf its matching top clay after actual token receipt', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.occupationPlayed = ['E103_Wolf']
      player.cardStates.E103_Wolf = { stack: ['clay'] }
    }, false)
    nextTurn(session, play(session))
    session.takeAction(0, 'farmland')
    let response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(options(response).filter(option => option.sourceCard === 'E103_Wolf' || option.value === 'E103_Wolf')).toHaveLength(1)
    response = choose(session, response, 'E103_Wolf')
    response = accept(session, response)
    expect(response.state.players[0]!.cardStates.E103_Wolf?.stack).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, boar: 1 })
    expect(expectWait(response).interaction.request.kind).toBe('animal-reorg')
    const animalRequest = expectWait(response).interaction.request
    assert.ok(animalRequest.kind === 'animal-reorg', 'Expected Wolf animal settlement')
    response = session.resolveChoice(0, 'confirm', { zones: animalRequest.zones })
    expect(response.ok, response.error).toBe(true)
    response = exchangeWindow(session, response)
    response = skipExchange(session, response)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player' && event.resources.clay === 1)).toHaveLength(1)
  })

  it.each(['M017_Reforestation', 'M042_DeepPlow', 'M066_LandParcel', 'M064_FamilyBurialPlot'])('claims its original clay after a paid %s placement, not an invalid selection', card => {
    let session = setup(state => {
      const player = state.players[0]!
      player.minorHand.push(card)
      if (card === 'M017_Reforestation') player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
      if (card === 'M042_DeepPlow') player.minorPlayed = ['__test_placeholder__']
      if (card === 'M064_FamilyBurialPlot') player.houseType = 'stone'
    })
    nextTurn(session, play(session))
    let response = play(session, card, 'meeting-place')
    if (expectWait(response).interaction.promptKey === 'ui.interactionOptionalAction') response = accept(session, response)
    expect(selection(response).kind).toBe('farm-position')
    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(rejected.ok).toBe(false)
    expect(keys(rejected.state)).toEqual(original)
    expect(rejected.state.players[0]!.resources.clay).toBe(0)
    session = restore(session)
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    response = exchangeWindow(session, response)
    expect(keys(response.state)).toEqual(['0-4', '1-4', '2-3', '2-4'])
    expect(response.state.players[0]!.resources.clay).toBe(1)
    skipExchange(session, response)
  })

  it.each(['M042_DeepPlow', 'M064_FamilyBurialPlot'])('does not claim clay when the optional %s placement is skipped', card => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorHand.push(card)
      if (card === 'M042_DeepPlow') player.minorPlayed = ['__test_placeholder__']
      else player.houseType = 'stone'
    })
    nextTurn(session, play(session))
    const response = choose(session, play(session, card, 'meeting-place'), '__skip__')
    expect(keys(response.state)).toEqual(original)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it.each([true, false])('keeps original terrain clay-free when Moor Archaeology block=%s', block => {
    const session = setup(state => {
      state.players[0]!.houseType = 'clay'
      state.players[0]!.minorPlayed = ['M070_MoorArchaeology']
    })
    nextTurn(session, play(session))
    let response = special(session, 'cut-peat', { row: 0, col: 2 })
    if (options(response).some(option => option.value === 'M070_MoorArchaeology')) response = choose(session, response, 'M070_MoorArchaeology')
    response = block ? accept(session, response) : choose(session, response, '__skip__')
    expect(keys(response.state)).toEqual(original)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.farmyardSpaceStates?.some(token => token.sourceCardId === 'M070_MoorArchaeology')).toBe(block)
  })

  it('keeps legally covered moor used while Bog Forest is placed and removed', () => {
    const session = setup(state => {
      const player = state.players[0]!
      threeWorkers(state)
      player.minorHand.push('M047_BogForest')
      player.improvements = ['Major_Well', 'Major_Joinery']
      player.resources.vegetable = 1
    })
    nextTurn(session, play(session))
    let response = play(session, 'M047_BogForest', 'meeting-place')
    expect(selection(response).kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 2, kind: 'forest', covered: 'moor' })
    nextTurn(session, response, 'clay-pit')
    response = special(session, 'fell-trees', { row: 0, col: 2 })
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 2, kind: 'moor' })
    expect(keys(response.state)).toEqual(['0-4', '1-4', '2-3', '2-4'])
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('never replenishes a claimed position when its new forest is removed and the position is plowed', () => {
    const session = setup(state => {
      threeWorkers(state)
      const player = state.players[0]!
      player.minorHand.push('M017_Reforestation')
      player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
    })
    nextTurn(session, play(session))
    let response = play(session, 'M017_Reforestation', 'meeting-place')
    expect(selection(response).kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    nextTurn(session, skipExchange(session, response), 'clay-pit')
    response = special(session, 'fell-trees', { row: 0, col: 4 })
    nextTurn(session, response)
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toEqual(['1-4', '2-3', '2-4'])
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
  })

  it.each(['M050_FarmExtension', 'M051_MoorEnclosures'])('initializes clay only on unused spaces of a preexisting %s extension', card => {
    const session = setup(state => {
      const player = state.players[0]!
      player.farmTerrain = []
      player.fields = [...[0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] }))), { row: 0, col: 2, stacks: [] }, { row: 1, col: 2, stacks: [] }]
      player.minorPlayed = [card]
      expect(addFarmyardExtension(player, card, [{ row: -1, col: 0 }, { row: -1, col: 1 }])).toBe(true)
      if (card === 'M051_MoorEnclosures') {
        player.houseType = 'clay'
        player.farmTerrain = [{ row: -1, col: 0, kind: 'moor' }, { row: -1, col: 1, kind: 'moor' }]
      }
    })
    const response = play(session)
    expect(keys(response.state)).toEqual(card === 'M050_FarmExtension'
      ? ['-1-0', '-1-1', '0-0', '0-1', '1-1', '2-1', '2-2']
      : ['0-0', '0-1', '1-1', '2-1', '2-2'])
  })

  it.each(['M050_FarmExtension', 'M051_MoorEnclosures'])('does not backfill historical clay after paid %s creates new coordinates', card => {
    const session = setup(state => {
      threeWorkers(state)
      const player = state.players[0]!
      player.minorHand.push(card)
      if (card === 'M050_FarmExtension') player.resources.clay = 1
      else player.houseType = 'clay'
    })
    nextTurn(session, play(session))
    let response = play(session, card, 'meeting-place')
    expect(selection(response).kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 0 }, { row: -1, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.resources.stone).toBe(card === 'M051_MoorEnclosures' ? 19 : 20)
    nextTurn(session, response, 'clay-pit')
    if (card === 'M051_MoorEnclosures') nextTurn(session, special(session, 'cut-peat', { row: -1, col: 0 }))
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: -1, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(keys(response.state)).toEqual(['0-4', '1-4', '2-3', '2-4'])
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(expectWait(response).interaction.request.kind).toBe('confirm-next-player')
  })

  it('counts actual claimed clay once toward Claypipe seven-building-resource return-home reward', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = ['A053_Claypipe']
      player.rooms = 3
      player.roomTiles.push({ row: 0, col: 3 })
      setActiveWorkerCount(player, 3)
      setWorkersAtHome(state, player, 3)
      state.players[1]!.resources.food = 50
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 6
    })
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(getWorkPhaseBuildingResources(response.state, response.state.players[0]!.id)).toBe(6)
    nextTurn(session, response)
    nextTurn(session, play(session), 'clay-pit')
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })
    response = exchangeWindow(session, response)
    expect(getWorkPhaseBuildingResources(response.state, response.state.players[0]!.id)).toBe(7)
    response = skipExchange(session, response)
    response = choose(session, response, 'confirm')
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'A053_Claypipe' && event.resources.food === 2)).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(22)
  })

  it.each(['field', 'stable', 'pasture', 'blocked'])('never places clay on an already used %s space', kind => {
    const session = setup(state => {
      const player = state.players[0]!
      if (kind === 'field') player.fields.push({ row: 0, col: 2, stacks: [] })
      if (kind === 'stable') player.stableTiles = [{ row: 0, col: 2 }]
      if (kind === 'pasture') {
        player.pastures = [{ id: 'old', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
        player.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence' }))
      }
      if (kind === 'blocked') {
        player.houseType = 'stone'
        player.minorPlayed = ['M064_FamilyBurialPlot']
        player.farmyardSpaceStates = [{ spaceKey: '0-2', sourceCardId: 'M064_FamilyBurialPlot', kind: 'blocked-farmyard-space', blocksPlacement: true }]
      }
    }, false)
    const response = play(session)
    expect(keys(response.state)).toHaveLength(6)
    expect(keys(response.state)).not.toContain('0-2')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it.each(['M111_NoTillFarming', 'M035_HorseTrough', 'B038_FutureBuildingSite', 'M096_FallowLand'])('keeps %s spaces unused when placing clay', card => {
    const session = setup(state => {
      const player = state.players[0]!
      player.farmTerrain = []
      player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
      player.minorPlayed = [card]
      if (card === 'M111_NoTillFarming') player.farmyardSpaceStates = [{ spaceKey: '0-2', sourceCardId: card, kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 3 } }]
      if (card === 'B038_FutureBuildingSite') player.cardStates[card] = { extraData: { locked: [{ row: 0, col: 0 }] } }
      if (card === 'M096_FallowLand') {
        player.minorPlayed.push('M111_NoTillFarming', 'B015_CarpentersBench')
        player.farmyardSpaceStates = [{ spaceKey: '0-2', sourceCardId: card, kind: 'farmyard-goods-token', resources: { food: 1 }, claimPolicy: 'when-no-longer-unused' }]
      }
      if (card === 'M035_HorseTrough') {
        player.resources.horse = 1
        player.cardStates[card] = { extraData: { animalCountsByZone: { [buildCardAnimalZoneId(card, { row: 0, col: 0 })]: { animalCounts: { horse: 1 } } } } }
      }
    })
    const before = [...getUsedFarmyardTileKeys(session.state.players[0]!)].sort()
    const response = play(session)
    expect(keys(response.state)).toEqual(['0-0', '0-1', '0-2', '1-1', '1-2', '2-1', '2-2'])
    expect([...getUsedFarmyardTileKeys(response.state.players[0]!)].sort()).toEqual(before)
    if (card === 'M035_HorseTrough') expect(session.withCtx(() => computeAnimalZones(response.state.players[0]!, response.state))).toContainEqual(expect.objectContaining({ farmPosition: { row: 0, col: 0 }, animalCount: 1 }))
  })

  it('does not mistake an eight-space farm with a temporarily blocked non-field crop for seven unused spaces', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.farmTerrain = []
      player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] }))).slice(0, 5)
      player.minorPlayed = ['M111_NoTillFarming']
      player.farmyardSpaceStates = [{ spaceKey: '0-2', sourceCardId: 'M111_NoTillFarming', kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 3 } }]
    })
    const response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    expect(options(response).some(option => option.value === CARD)).toBe(false)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD)
    expect(keys(response.state)).toEqual([])
  })

  it.each(['plow', 'construct', 'stables', 'fence'])('claims only the original token changed by a real %s action', action => {
    const session = setup(state => { state.round = 4 }, false)
    nextTurn(session, play(session))
    let response = session.takeAction(0, action === 'plow' ? 'farmland' : action === 'fence' ? 'fencing' : 'farm-expansion')
    const mode = options(response).find(option => option.labelKey === `actions.${action}.name`)
    if (mode) response = choose(session, response, mode.value)
    expect(response.ok, response.error).toBe(true)
    expect(expectWait(response).interaction.request.kind).toBe('farm-select')
    const tile = action === 'plow' ? { row: 0, col: 2 } : { row: 0, col: 0 }
    response = session.commitSelectionChoice(0, action === 'plow' ? { tile } : action === 'construct' ? { rooms: [tile] } : action === 'stables' ? { stables: [tile] } : { edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'] })
    expect(response.ok, response.error).toBe(true)
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toHaveLength(6)
    expect(keys(response.state)).not.toContain(`${tile.row}-${tile.col}`)
    response = skipExchange(session, response)
    if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
    if (options(response).some(option => option.value === '__done__')) response = choose(session, response, '__done__')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('confirm-next-player')
  })

  it.each([0, 1, 2])('offers only actual two-clay receipt amounts; exchanges %i', count => {
    const session = setup(state => { state.round = 4 })
    nextTurn(session, play(session))
    session.takeAction(0, 'fencing')
    let response = session.commitSelectionChoice(0, { edges: ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'] })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(keys(response.state)).toEqual(['1-4', '2-3', '2-4'])
    if (count === 0) response = choose(session, response, '__skip__')
    else {
      const option = options(response).find(entry => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesPaid?.clay === count)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = choose(session, response, option!.value)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2 - count, food: 20 + 2 * count })
  })

  it.each(['stone', 'wood'] as const)('claims a scheduled room at the real round start only for %s house', houseType => {
    const session = setup(state => {
      state.round = 11
      const player = state.players[0]!
      player.houseType = houseType
      player.minorPlayed = ['B014_Hawktower']
      state.players[1]!.resources.food = 50
      state.futureMeeples.push({ id: 'hawktower-12', cardId: 'B014_Hawktower', playerId: player.id,
        round: 12, actionId: null, resources: {}, roomType: 'stone' })
    }, false)
    nextTurn(session, play(session))
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    choose(session, response, 'confirm')
    response = session.takeAction(1, 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
    for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
      else if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
      else throw new Error(`Unexpected round interaction: ${JSON.stringify(response.interaction)}`)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(12)
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.rooms).toBe(houseType === 'stone' ? 3 : 2)
    expect(response.state.players[0]!.resources.clay).toBe(houseType === 'stone' ? 1 : 0)
    expect(keys(response.state)).toHaveLength(houseType === 'stone' ? 6 : 7)
    expect(response.state.events.filter(event => event.type === 'farm.roomBuilt')).toHaveLength(houseType === 'stone' ? 1 : 0)
  })

  it.each([true, false])('claims the original clay exactly once with exchange=%s, restoration and undo', exchange => {
    let session = setup()
    nextTurn(session, play(session))
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    session = restore(session)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toEqual(['0-4', '1-4', '2-3', '2-4'])
    expect(readCardResourceStats(response.state.players[0]!, CARD)?.gained).toEqual({ clay: 1 })
    expect(response.state.players[0]!.stats?.resourcesFromCards.clay).toBe(1)
    expect(session.withCtx(() => serializeState(response.state, { actionHooks: session.actionHooks })).players[0]!.cardStatePresentation[CARD]?.resourceGroups).toEqual([{ clay: 4 }])
    session = restore(session)
    response = exchange ? accept(session, session.getState()) : choose(session, session.getState(), '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: exchange ? 0 : 1, food: exchange ? 22 : 20 })
    expect(readCardResourceStats(response.state.players[0]!, CARD)?.gained).toEqual(exchange ? { clay: 1, food: 2 } : { clay: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player' && event.resources.clay === 1)).toHaveLength(1)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(keys(response.state)).toEqual(original)
    session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    response = exchangeWindow(session, response)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(keys(response.state)).toHaveLength(4)
    skipExchange(session, response)
  })

  it('places clay on exactly five unused spaces in the real Moor starting farm', () => {
    const session = setup()
    const response = play(session)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, reed: 9, clay: 0 })
    expect(keys(response.state)).toEqual(original)
    const placements = response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'field')
    expect(placements).toHaveLength(5)
    expect(placements.flatMap(event => event.type === 'resource.moved' && event.to.kind === 'field' ? [`${event.to.row}-${event.to.col}`] : [])).toEqual(original)
    for (const event of placements) expect(event).toMatchObject({ resources: { clay: 1 }, from: { kind: 'supply' }, reason: 'cardEffect' })
    for (const viewer of [response.state.players[0]!.id, response.state.players[1]!.id, null]) {
      expect(session.buildSyncPayload(response, viewer).state.players[0]!.farmyardSpaceStates).toEqual(response.state.players[0]!.farmyardSpaceStates)
    }
    for (const token of tokens(response.state)) {
      expect(token).toMatchObject({ resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' })
      expect(token.blocksPlacement).toBeUndefined()
      expect(getUsedFarmyardTileKeys(response.state.players[0]!).has(token.spaceKey)).toBe(false)
    }
  })

  it('never borrows another space clay after an original moor is cleared and plowed', () => {
    const session = setup()
    let response = play(session)
    response = nextTurn(session, response)
    const special = response.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    response = session.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    nextTurn(session, response, 'forest')
    response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 2, stacks: [] })
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(keys(response.state)).toEqual(original)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.to.kind === 'player')).toEqual([])
  })
})

describe("A040 command boundaries", () => {
  const A040 = 'A040_PottersYard'
  const tile = { row: 1, col: 1 }, pair = [tile, { row: 2, col: 1 }]
  const edges = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']
  const fieldTiles = [0, 1, 2, 3, 4].map(col => ({ row: 0, col })).concat({ row: 1, col: 4 })

  function confirmed(r: SessionResponse, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? getChoiceOptions(r) : []
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function minor(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = minor(s, card)
    return confirmed(r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card))
  }
  function denied(s: GameSession, card: string) {
    const r = minor(s, card)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.ok(s.getState().state.players[0]!.minorHand.includes(card))
  }

  function remaining(r: SessionResponse) {
    return (r.state.players[0]!.farmyardSpaceStates ?? []).filter(token => token.sourceCardId === A040 && token.kind === 'farmyard-goods-token').reduce((sum, token) => sum + (token.resources?.clay ?? 0), 0)
  }
  function potter({ fields = 6, used = 'none', resources = { wood: 1, reed: 1 } }: {
    fields?: number
    used?: 'none' | 'stable' | 'pasture'
    resources?: Partial<PlayerState['resources']>
  } = {}) {
    return sessionEvidence.track(createWorkSession({ seed: 724, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
          player.minorPlayed = []
          player.occupationPlayed = []
          player.improvements = []
          player.cardStates = {}
          player.rooms = 2
          player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
          player.fields = []
          player.stableTiles = []
          player.pastures = []
          player.fenceSegments = []
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        }
        const owner = state.players[0]!
        owner.minorHand = [A040, '__test_placeholder__']
        owner.fields = fieldTiles.slice(0, fields).map(position => ({ ...position, stacks: [] }))
        if (used === 'stable')
          owner.stableTiles = [tile]
        if (used === 'pasture') {
          owner.pastures = [{ id: 'existing', tiles: [tile], animalType: null, animalCount: 0 }]
          owner.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
        }
        Object.assign(owner.resources, resources)
        state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      } }))
  }
  function boughtPotter(s: GameSession, opponentPlow = false) {
    const r = buy(s, A040)
    assert.equal(remaining(r), 7)
    if (opponentPlow) {
      turn(s, 1, 'farmland')
      confirmed(ok(s.commitSelectionChoice(1, { tile: { row: 0, col: 0 } })), 1)
    }
    else
      turn(s, 1, 'forest')
    return s
  }
  function farm(s: GameSession, type: 'construct' | 'stables') {
    let r = turn(s, 0, 'farm-expansion')
    if (opts(r).length)
      r = choose(s, r, o => o.value.includes(type))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    return r
  }
  function exchangeOffer(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, A040)
    assert.equal(r.interaction.promptKey, 'ui.interactionFlowSelect')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    const choices = opts(r).filter(option => !option.disabled && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.clay === 1 && option.effectPreview.resourcesGained?.food === 2)
    assert.equal(choices.length, 1, JSON.stringify(r.interaction))
    assert.ok(opts(r).some(option => option.value === '__skip__' && !option.disabled))
    return choices[0]!
  }
  function declineExchange(s: GameSession, r: SessionResponse) {
    exchangeOffer(r)
    return confirmed(ok(s.resolveChoice(0, '__skip__')))
  }
  function exchange(s: GameSession, r: SessionResponse, partial = false) {
    const choice = exchangeOffer(r)
    if (partial)
      assert.equal(r.state.players[0]!.resources.clay, 2)
    return confirmed(ok(s.resolveChoice(0, choice.value)))
  }
  function plow(s: GameSession) {
    return ok(s.commitSelectionChoice(0, { tile }))
  }
  it("eight unused spaces or fee shortage reject before seven-space onBuy control", () => {
    denied(potter({ fields: 5 }), A040)
    denied(potter({ resources: { wood: 0, reed: 1 } }), A040)
    denied(potter({ resources: { wood: 1, reed: 0 } }), A040)
    const r = buy(potter(), A040)
    assert.equal(remaining(r), 7)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
  })
  it("new field collects one clay after invalid room target and may decline exchange", () => {
    const s = boughtPotter(potter())
    turn(s, 0, 'farmland')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    const r = declineExchange(s, plow(s))
    assert.equal(r.state.players[0]!.fields.length, 7)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(remaining(r), 6)
  })
  it("new stable exchanges exactly one collected clay for two food once", () => {
    const s = boughtPotter(potter({ resources: { wood: 3, reed: 1 } }))
    farm(s, 'stables')
    const pending = ok(s.commitSelectionChoice(0, { stables: [tile] }))
    const old = opts(pending).find(o => o.value !== '__skip__')
    assert.ok(old)
    assert.notEqual(old.disabled, true)
    const r = exchange(s, pending)
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assert.equal(remaining(r), 6)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it("two new rooms collect two clay and permit a one-clay partial exchange", () => {
    const s = boughtPotter(potter({ resources: { wood: 11, reed: 5 } }))
    farm(s, 'construct')
    const r = exchange(s, ok(s.commitSelectionChoice(0, { rooms: pair })), true)
    assert.equal(r.state.players[0]!.rooms, 4)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assert.equal(remaining(r), 5)
  })
  it("new pasture collects clay while opponent plow does not consume holder supply", () => {
    const s = boughtPotter(potter({ resources: { wood: 5, reed: 1 } }), true)
    assert.equal(remaining(s.getState()), 7)
    assert.equal(s.getState().state.players[1]!.resources.clay, 0)
    turn(s, 0, 'fencing')
    const r = declineExchange(s, ok(s.commitSelectionChoice(0, { edges, extraWood: 0 })))
    assert.equal(r.state.players[0]!.pastures.flatMap(p => p.tiles).length, 1)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(remaining(r), 6)
  })
  it("stable in pasture and fencing an existing stable collect no second clay", () => {
    for (const used of ['pasture', 'stable'] satisfies ('pasture' | 'stable')[]) {
      const s = boughtPotter(potter({ fields: 5, used, resources: { wood: used === 'pasture' ? 3 : 5, reed: 1 } }))
      let r: SessionResponse
      if (used === 'pasture') {
        farm(s, 'stables')
        r = confirmed(ok(s.commitSelectionChoice(0, { stables: [tile] })))
      }
      else {
        turn(s, 0, 'fencing')
        r = confirmed(ok(s.commitSelectionChoice(0, { edges, extraWood: 0 })))
      }
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.resources.food, 40)
      assert.equal(remaining(r), 7)
    }
  })
  it("undo restores newly used tile and clay before replay without exchange", () => {
    const s = boughtPotter(potter())
    ready(s, 0)
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    assert.equal(s.getState().interaction.stateId, 'idle')
    const initial = s.getState()
    assert.deepEqual(initial.state.players[0]!.playedCards, [])
    // #1258: restore currently rebuilds this purchase's canonical card alias.
    const before = undoRuleSnapshot({
      ...initial,
      state: {
        ...initial.state,
        players: initial.state.players.map((player, index) => index === 0
          ? { ...player, playedCards: ['minor:A040_PottersYard'] }
          : player),
      },
    })
    turn(s, 0, 'farmland')
    exchange(s, plow(s))
    const beforeRestored = s.undoAction()
    assertUndoRestored(before, beforeRestored)
    assert.equal(JSON.stringify(beforeRestored.interaction), beforeInteraction)
    assert.equal(beforeRestored.state.currentPlayerIndex, 0)
    turn(s, 0, 'farmland')
    const r = declineExchange(s, plow(s))
    assert.equal(r.state.players[0]!.fields.length, 7)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(remaining(r), 6)
  })
})

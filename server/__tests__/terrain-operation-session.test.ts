import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { buildTerrainSelectionLeaf } from '../../shared/moor/terrain-flow'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { setActiveWorkerCount } from '../../shared/domain/player'
import type { FarmTerrainOperationMode } from '../../shared/contract/types'

const SOURCE = 'TEST_TerrainOperation'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  if (value !== 'confirm') expect(options(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function play(session: GameSession, card: string, space = 'major-improvement') {
  let response = session.takeAction(0, space)
  for (let guard = 0; guard < 8 && !response.state.players[0]!.minorPlayed.includes(card); guard++) {
    const next = options(response).find(option => option.value === card || option.value.startsWith('action-improvement-'))
    if (!next) throw new Error(`Expected purchase: ${JSON.stringify(response.interaction)}`)
    response = choose(session, response, next.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

function nextTurn(session: GameSession, response: SessionResponse, opponentSpace: string) {
  response = choose(session, response, 'confirm')
  if (response.state.currentPlayerIndex === 1) {
    response = session.takeAction(1, opponentSpace)
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'confirm')
  }
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

const terrainCases: Array<{ mode: FarmTerrainOperationMode; valid: { row: number; col: number }; invalid: { row: number; col: number } }> = [
  { mode: 'place', valid: { row: 0, col: 1 }, invalid: { row: 0, col: 2 } },
  { mode: 'remove', valid: { row: 0, col: 2 }, invalid: { row: 0, col: 4 } },
  { mode: 'replace-kind', valid: { row: 0, col: 2 }, invalid: { row: 1, col: 2 } },
  { mode: 'replace-with-field', valid: { row: 0, col: 4 }, invalid: { row: 2, col: 4 } },
  { mode: 'cover', valid: { row: 0, col: 2 }, invalid: { row: 1, col: 2 } },
]

function terrainCaseSession(test: typeof terrainCases[number]) {
  const session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed = [SOURCE]
    player.fields = [{ row: 0, col: 3, stacks: [] }]
    player.farmTerrain = [
      { row: 0, col: 2, kind: 'forest' }, { row: 1, col: 2, kind: 'forest', covered: 'moor' },
      { row: 0, col: 4, kind: 'moor' }, { row: 2, col: 4, kind: 'moor' },
    ]
    player.resources.fuel = 0
  } })
  sessions.push(session)
  session.withCtx(() => requireActiveCardRegistry('terrain-operation-session').registerListener({
    id: 'test-terrain-before-plow', cardIds: [SOURCE], actions: ['plow'], phases: ['before'], mandatory: true,
    handler: () => ({ sourceCard: SOURCE, flow: buildTerrainSelectionLeaf({
      sourceCard: SOURCE, mode: test.mode, kind: 'forest',
      fromKind: test.mode === 'replace-with-field' ? 'moor' : 'forest', toKind: test.mode === 'cover' ? 'forest' : 'moor',
      selectableTiles: [test.valid, test.invalid], minSelections: 0, maxSelections: 2, gainPerSelection: { fuel: 1 },
    }) }),
  }))
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
  return session
}

// Approved seams: actual two-player Moor Session, selection submission,
// authoritative state/log/scores and persisted pending; no mocked executor.
describe('atomic terrain operations', () => {
  it('counts a later independent stable on a cleared tile as newly used', () => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.fields = []
      player.farmTerrain = [{ row: 0, col: 2, kind: 'forest' }]
      player.resources.wood = 2
    } })
    sessions.push(session)
    const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('fell-trees'))!
    let response = session.takeSpecialAction(0, special.id, 'fell-trees', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([])
    nextTurn(session, response, 'day-laborer')
    response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    expect(player.stableTiles).toEqual([{ row: 0, col: 2 }])
    expect(player.resources.wood).toBe(2)
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toMatchObject([{
      newlyUsedTiles: [{ playerId: player.id, row: 0, col: 2 }],
    }])
  })

  it('offers one optional sow for Slash and Burn and preserves a declined choice', () => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.minorPlayed = ['M059_NaturesFertilizer']
      player.fields = []
      player.farmTerrain = [{ row: 0, col: 2, kind: 'forest' }]
      player.resources.grain = 2
    } })
    sessions.push(session)
    const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('slash-and-burn'))!
    let response = session.takeSpecialAction(0, special.id, 'slash-and-burn', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe('M059_NaturesFertilizer')
    expect(options(response).map(option => option.value)).toContain('__skip__')
    response = choose(session, response, '__skip__')
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 2, stacks: [] }])
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toHaveLength(1)
  })

  it('keeps nested new-field receipts separate through restored sowing and undo', () => {
    let session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.minorPlayed = [SOURCE, 'M059_NaturesFertilizer']
      player.fields = [{ row: 0, col: 3, stacks: [] }]
      player.farmTerrain = [{ row: 0, col: 4, kind: 'moor' }, { row: 1, col: 3, kind: 'moor' }]
      Object.assign(player.resources, { grain: 3, fuel: 0 })
      player.cardStates.M059_NaturesFertilizer = { extraData: { selectedPositions: ['0-3'] } }
    } })
    sessions.push(session)
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('terrain-operation-session')
      registry.registerListener({
        id: 'test-outer-terrain-before-plow', cardIds: [SOURCE], actions: ['plow'], phases: ['before'], mandatory: true,
        handler: () => ({ sourceCard: SOURCE, flow: buildTerrainSelectionLeaf({
          sourceCard: SOURCE, mode: 'replace-with-field', fromKind: 'moor',
          selectableTiles: [{ row: 0, col: 4 }], gainPerSelection: { fuel: 1 },
        }) }),
      })
      registry.registerListener({
        id: 'test-nested-terrain-before-reward', cardIds: [SOURCE], actions: ['gain'], phases: ['before'], mandatory: true,
        handler: context => context.player.farmTerrain?.some(tile => tile.row === 1 && tile.col === 3)
          ? { sourceCard: SOURCE, flow: buildTerrainSelectionLeaf({
            sourceCard: SOURCE, mode: 'replace-with-field', fromKind: 'moor', selectableTiles: [{ row: 1, col: 3 }],
          }) } : undefined,
      })
    })
    session.takeAction(0, 'farmland')
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    response = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, options(response).find(option => option.value !== '__skip__')!.value)
    expect(response.interaction.request.farm.selectableFields.map(field => field.tile)).toEqual([{ row: 1, col: 3 }])
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    session = restored
    response = session.commitSelectionChoice(0, { crops: [{ row: 1, col: 3, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(1)
    response = choose(session, response, options(response).find(option => option.value !== '__skip__')!.value)
    expect(response.interaction.request.farm.selectableFields.map(field => field.tile)).toEqual([{ row: 0, col: 4 }])
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { crops: [{ row: 0, col: 3, crop: 'grain' }] }))
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 4, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields).toEqual([
      { row: 0, col: 3, stacks: [] },
      { row: 0, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 1, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('farm-select')
    expect(response.interaction.request.farm.selectableFields.map(field => field.tile)).toEqual([{ row: 0, col: 4 }])
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields[2]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toHaveLength(2)
  })

  it.each(terrainCases)('$mode rejects the whole mixed batch, duplicate and invalid coordinate before a successful retry', test => {
    const session = terrainCaseSession(test)
    const snapshot = JSON.stringify(serializeSessionSnapshot(session.state, session))
    for (const positions of [[test.valid, test.invalid], [test.valid, test.valid], [test.valid, { row: 99, col: 99 }]]) {
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { positions }))
      expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(snapshot)
    }
    const response = session.commitSelectionChoice(0, { positions: [test.valid] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(1)
    const facts = response.state.events.filter(event => event.type === 'farm.terrainChanged')
    expect(facts).toHaveLength(1)
    expect(facts).toMatchObject([{ operation: test.mode, sourceCardId: SOURCE,
      changes: [{ ...test.valid, fieldCreated: test.mode === 'replace-with-field' }] }])
    if (test.mode === 'cover') expect(response.state.players[0]!.farmTerrain)
      .toContainEqual({ ...test.valid, kind: 'forest', covered: 'forest' })
    if (test.mode === 'replace-with-field') expect(response.state.players[0]!.fields)
      .toEqual([{ row: 0, col: 3, stacks: [] }, { ...test.valid, stacks: [] }])
  })

  it.each(terrainCases)('$mode accepts an optional empty selection without a change fact or reward', test => {
    const session = terrainCaseSession(test)
    const before = JSON.stringify(session.state.players[0]!.farmTerrain)
    const response = session.commitSelectionChoice(0, { positions: [] })
    expect(response.ok, response.error).toBe(true)
    expect(JSON.stringify(response.state.players[0]!.farmTerrain)).toBe(before)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toEqual([])
  })

  it('rejects a mixed remove batch before storing selections, survives restore and permits a legal retry', () => {
    let session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.minorPlayed = [SOURCE]
      player.fields = []
      player.farmTerrain = [{ row: 0, col: 2, kind: 'forest' }, { row: 1, col: 2, kind: 'moor' }]
      player.resources.wood = 0
    } })
    sessions.push(session)
    session.withCtx(() => requireActiveCardRegistry('terrain-operation-session').registerListener({
      id: 'test-terrain-before-plow', cardIds: [SOURCE], actions: ['plow'], phases: ['before'], mandatory: true,
      handler: () => ({ sourceCard: SOURCE, flow: buildTerrainSelectionLeaf({
        sourceCard: SOURCE, mode: 'remove', kind: 'forest',
        selectableTiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], minSelections: 0, maxSelections: 2,
        gainPerSelection: { wood: 3 },
      }) }),
    }))
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
    const historyBefore = JSON.stringify(serializeSessionSnapshot(session.state, session))
    for (let attempt = 0; attempt < 2; attempt++) {
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, {
        positions: [{ row: 0, col: 2 }, { row: 1, col: 2 }],
      }))
      expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(historyBefore)
      expect(session.state.players[0]!.cardStates[SOURCE]?.extraData?.selectedPositions).toBeUndefined()
    }
    const restored = new GameSession(rehydrateState(JSON.parse(historyBefore)))
    sessions.push(restored)
    session = restored
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual([{ row: 1, col: 2, kind: 'moor' }])
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[SOURCE]?.extraData?.selectedPositions).toEqual(['0-2'])
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged')).toMatchObject([{
      sourceCardId: SOURCE, changes: [{ row: 0, col: 2, before: { kind: 'forest' }, after: null, fieldCreated: false }],
    }])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
  })

  it('binds Forest Hut to the purchased forest layer, not a later identical covering layer', () => {
    const hut = 'M053_ForestHut'
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true }, configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.minorHand = [hut, 'M046_Thicket']
      player.farmTerrain = [
        { row: 0, col: 2, kind: 'forest' }, { row: 0, col: 3, kind: 'forest' },
        { row: 1, col: 2, kind: 'forest' }, { row: 2, col: 2, kind: 'forest' },
      ]
      player.fields = []
      player.rooms = 3
      player.roomTiles.push({ row: 0, col: 0 })
      setActiveWorkerCount(player, 3)
      Object.assign(player.resources, { wood: 20, food: 20 })
    } })
    sessions.push(session)
    play(session, hut)
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    const workerId = response.state.players[0]!.cardStates[hut]?.extraData?.temporaryWorkerId
    expect(typeof workerId).toBe('string')
    nextTurn(session, response, 'day-laborer')
    play(session, 'M046_Thicket', 'meeting-place')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 2, kind: 'forest', covered: 'forest' })
    response = nextTurn(session, response, 'clay-pit')
    const special = response.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('fell-trees'))!
    response = session.takeSpecialAction(0, special.id, 'fell-trees', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    expect(player.farmTerrain).toContainEqual({ row: 0, col: 2, kind: 'forest' })
    expect(player.cardStates[hut]?.extraData?.boundForest).toEqual({ row: 0, col: 2 })
    expect(player.workers.find(worker => worker.id === workerId)?.supplyUse?.returnRound).toBeUndefined()
  })
})

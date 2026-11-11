import { afterEach, expect, it } from 'vitest'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { getChoiceOptions } from './_helpers/session-assertions'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { descriptionEffects } from './_helpers/choice-description'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function table(configure: (state: GameState) => void, playerCount = 2, moor = false) {
  const session = createWorkSession({ seed: 1655, options: { playerCount, enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 14
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    configure(state)
  } })
  expect(session.getState().state).toMatchObject({ phase: 'playing', roundPhase: 'work', currentPlayerIndex: 0 })
  expect(session.getState().interaction.stateId).toBe('idle')
  sessions.push(session)
  return session
}

function restore(original: GameSession) {
  const snapshot = original.withCtx(() => serializeSessionSnapshot(original.state, original))
  const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(session)
  expect(session.getState().interaction).toEqual(original.getState().interaction)
  return session
}

it.each([
  { card: 'C087_Mason', action: 'C87-mason-anytime', count: 4 },
  { card: 'D087_MasterBuilder', action: 'D87-master-builder-anytime', count: 5 },
])('$card keeps its own-house room local through recovery and rejects an obsolete target choice', ({ card, action, count }) => {
  const original = table(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = [card]
    owner.houseType = 'stone'
    owner.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 },
      ...(count === 5 ? [{ row: 2, col: 2 }] : [])]
    owner.rooms = count
    if (card === 'C087_Mason') owner.cardStates[card] = { extraData: { hasRoom: true } }
  })
  const offered = original.takeAnytimeAction(0, action)
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'room' } } })
  assertRejectedUnchanged(original, () => original.resolveChoice(0, 'target-farm:p2'))
  assertRejectedUnchanged(original, () => original.commitSelectionChoice(1, { rooms: [{ row: 0, col: 0 }] }))
  const session = restore(original)
  const built = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.rooms).toBe(count + 1)
  expect(built.state.players[0]!.cardStates[card]?.flagged).toBe(true)
  expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, stone: 0, reed: 0 })
  expect(built.state.players[1]!.rooms).toBe(2)
  expect(built.state.log.some(entry => entry.key.startsWith('log.partnerRoomsBuilt'))).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'stoneRooms')?.total).toBe((count + 1) * 2)
  expect(built.state.players[1]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
})

it('Amateur Fencer only grants a pasture on its owner farm in a two-player runtime fixture', () => {
  const card = 'C170_AmateurFencer'
  const session = table(state => {
    state.players[0]!.occupationHand = [card]
    state.players[0]!.resources.wood = 2
  }, 2)
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationPlayed.includes(card)) response = session.resolveChoice(0, card)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.promptKey === 'ui.interactionOptionalAction') {
    const accept = getChoiceOptions(response).find(option => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p2'))
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.pastures).toHaveLength(1)
  expect(built.state.players[1]!.pastures).toEqual([])
  expect(built.state.players[0]!.resources.wood).toBe(2)
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
})

it('Diligent Farmer extends its owner house after a real occupation purchase, leaving the other house unchanged', () => {
  const card = 'E127_DiligentFarmer'
  const session = table(state => {
    const owner = state.players[0]!
    owner.occupationHand = [card]
    owner.fields = [0, 1, 2, 3, 4].map(col => ({ row: 0, col, stacks: [] }))
    owner.resources.grain = 8
    owner.resources.vegetable = 4
  })
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationPlayed.includes(card)) {
    expect(getChoiceOptions(response).some(option => option.value === card)).toBe(true)
    response = session.resolveChoice(0, card)
  }
  expect(response.ok, response.error).toBe(true)
  const accept = getChoiceOptions(response).find(option => option.value !== '__skip__' && !option.value.startsWith('target-farm:'))
  if (accept) response = session.resolveChoice(0, accept.value)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'room' } } })
  const built = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.rooms).toBe(3)
  expect(built.state.players[1]!.rooms).toBe(2)
  expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, grain: 8, vegetable: 4 })
  expect(built.state.log.some(entry => entry.key.startsWith('log.partnerRoomsBuilt'))).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'empty')?.total).toBe(-7)
})

it.each(['M038_NatureReserve', 'M039_SpecialPasture'])('%s keeps its lasting layout exception on its owner farm', card => {
  const session = table(state => {
    for (const player of state.players) player.farmTerrain = []
    const owner = state.players[0]!
    owner.minorHand = [card]
    owner.resources.wood = 4
    owner.resources.food = 1
    for (const player of [owner, state.players[1]!]) {
      player.fenceSegments = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      player.pastures = [{ id: 'pasture-1', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      if (card === 'M038_NatureReserve') player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
    }
  }, 2, true)
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.minorPlayed.includes(card)) {
    expect(getChoiceOptions(response).some(option => option.value === card)).toBe(true)
    response = session.resolveChoice(0, card)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.minorPlayed).toContain(card)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p2'))
  const continued = restore(session)
  const col = card === 'M038_NatureReserve' ? 1 : 2
  const built = continued.commitSelectionChoice(0, { edges: [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.fenceSegments).toHaveLength(card === 'M038_NatureReserve' ? 7 : 8)
  expect(built.state.players[0]!.pastures).toHaveLength(card === 'M038_NatureReserve' ? 1 : 2)
  expect(built.state.players[1]!.fenceSegments).toHaveLength(4)
  expect(built.state.players[1]!.pastures).toHaveLength(1)
  expect(built.state.players[0]!.resources.wood).toBe(card === 'M038_NatureReserve' ? 4 : 2)
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p2')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
  if (card === 'M038_NatureReserve') {
    expect(built.state.players[0]!.cardStates[card]?.extraData?.natureReserveTiles).toEqual([{ row: 0, col: 1 }])
    expect(built.state.players[1]!.cardStates[card]).toBeUndefined()
    assert.ok(built.interaction.stateId === 'wait' && built.interaction.request.kind === 'confirm-next-player')
    expect(continued.resolveChoice(built.interaction.playerIndex, 'confirm').ok).toBe(true)
    for (const [playerIndex, space] of [[1, 'grain-seeds']] satisfies Array<[number, string]>) {
      const turn = continued.takeAction(playerIndex, space)
      expect(turn.ok, turn.error).toBe(true)
      assert.ok(turn.interaction.stateId === 'wait' && turn.interaction.request.kind === 'confirm-next-player')
      expect(continued.resolveChoice(turn.interaction.playerIndex, 'confirm').ok).toBe(true)
    }
    const special = continued.state.farmersOfTheMoor?.specialActionCards.find(entry => entry.actions.includes('fell-trees'))
    assert.ok(special)
    const cleared = continued.takeSpecialAction(0, special.id, 'fell-trees', { tile: { row: 0, col: 1 } })
    expect(cleared.ok, cleared.error).toBe(true)
    expect(cleared.state.players[0]!.pastures).toHaveLength(2)
    expect(cleared.state.players[0]!.cardStates[card]?.extraData?.natureReserveTiles).toEqual([])
    expect(cleared.state.players[1]!.farmTerrain).toEqual([{ row: 0, col: 1, kind: 'forest' }])
    expect(cleared.state.players[1]!.pastures).toHaveLength(1)
  }
})

it('builds Farm Hand on its owner farm through a pending restore', () => {
  const session = table(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['B085_FarmHand']
    owner.fields = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }].map(tile => ({ ...tile, stacks: [] }))
    owner.resources.wood = 3
  })
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  const selected = session.getState()
  assert.ok(selected.interaction.stateId === 'wait' && selected.interaction.request.kind === 'farm-select')
  expect(selected.interaction.request.farm.farmHandPositions).toContainEqual({ row: 0, col: 2 })
  const continued = restore(session)
  const built = continued.commitSelectionChoice(0, { farmHand: { row: 0, col: 2 } })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(1)
  expect(built.state.players[0]!.stableTiles).toEqual([])
  expect(built.state.players[0]!.cardStates.B085_FarmHand).toMatchObject({ flagged: true, extraData: { position: { row: 0, col: 2 } } })
  expect(continued.withCtx(() => getExtraRoomCapacity(continued.state.players[0]!))).toBe(1)
  expect(continued.withCtx(() => getExtraRoomCapacity(continued.state.players[1]!))).toBe(0)
  expect(built.state.log.some(entry => entry.key === 'log.partnerStablesBuilt')).toBe(false)
})

it('keeps paid own-farm Wood Palisades and its card score through a pending restore', () => {
  const session = table(state => {
    state.players[0]!.minorPlayed = ['B030_WoodPalisades']
    state.players[0]!.resources.wood = 6
  })
  expect(session.takeAction(0, 'fencing').ok).toBe(true)
  const continued = restore(session)
  const built = continued.commitSelectionChoice(0, { edges: ['H-1-2', 'V-0-2', 'V-0-3'], palisadeEdges: ['H-0-2'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(1)
  expect(built.state.players[0]!.fenceSegments?.filter(segment => segment.type === 'palisade')).toHaveLength(1)
  expect(built.state.players[1]!.fenceSegments).toEqual([])
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
})

it('offers card-held Ash Trees pieces only for self building and preserves their reservation across recovery', () => {
  const session = table(state => {
    state.players[0]!.minorPlayed = ['E074_AshTrees']
    state.players[0]!.cardStates.E074_AshTrees = { counters: { fences: 5 } }
    state.players[0]!.resources.wood = 2
  })
  const offered = session.takeAction(0, 'fencing')
  expect(offered.ok, offered.error).toBe(true)
  expect(getChoiceOptions(offered).some(option => option.value === 'target-farm:p2')).toBe(false)
  const reserve = getChoiceOptions(offered).find(option => descriptionEffects(option.descriptionPreview)
    .some(effect => effect.kind === 'fenceReserve' && effect.amount === 4))
  expect(reserve).toBeDefined()
  const selected = session.resolveChoice(0, reserve!.value)
  expect(selected.ok, selected.error).toBe(true)
  const continued = restore(session)
  const built = continued.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(2)
  expect(built.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences).toBe(1)
  expect(built.state.players[0]!.pastures).toHaveLength(1)
  expect(built.state.players[1]!.pastures).toEqual([])
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
})

it('Stock Protector pays for its own fences and places the remaining person on Day Laborer', () => {
  const session = table(state => {
    state.players[0]!.occupationPlayed = ['B094_StockProtector']
    state.players[0]!.resources.wood = 2
  })
  const other = structuredClone(session.getState().state.players[1])
  const offered = session.takeAction(0, 'fencing')
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.state.players[0]!.resources.wood).toBe(4)
  expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] }))
  const fenced = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(fenced.ok, fenced.error).toBe(true)
  expect(fenced.state.players[0]!.resources.wood).toBe(0)
  expect(fenced.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionStockProtectorPlace' })
  const accept = getChoiceOptions(fenced).find(option => option.value !== '__skip__')
  assert.ok(accept)
  expect(session.resolveChoice(0, accept.value).ok).toBe(true)
  const placed = session.resolveChoice(0, 'day-laborer')
  expect(placed.ok, placed.error).toBe(true)
  expect(placed.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  expect(placed.state.players[1]).toEqual(other)
  expect(placed.state.actionSpaces.find(space => space.id === 'fencing')?.takenBy).toEqual([expect.objectContaining({ playerId: 'p1' })])
  expect(placed.state.actionSpaces.find(space => space.id === 'day-laborer')?.takenBy).toEqual([expect.objectContaining({ playerId: 'p1' })])
  expect(placed.state.events).toContainEqual(expect.objectContaining({ type: 'farm.fenceBuilt', actorPlayerId: 'p1', targetPlayerId: 'p1' }))
  const gain = placed.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'B094_StockProtector')
  const built = placed.state.events.findIndex(event => event.type === 'farm.fenceBuilt')
  const paid = placed.state.events.findIndex(event => event.type === 'resource.paid' && event.paymentFor === 'fencing')
  expect(gain).toBeGreaterThanOrEqual(0)
  expect(built).toBeGreaterThan(gain)
  expect(paid).toBeGreaterThan(built)
  expect(placed.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', playerId: 'p1', params: expect.objectContaining({ detailParts: expect.objectContaining({ effects: { fencing: 4 } }) }) }))
  expect(placed.scores?.[0]?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
})

it('Lazybones keeps a cross-player stable reward and its pending authority with the card owner', () => {
  const session = table(state => {
    state.players[1]!.occupationPlayed = ['E148_Lazybones']
    state.players[1]!.cardStates.E148_Lazybones = { extraData: { reservedActionSpaces: ['grain-seeds'] } }
  })
  let response = session.takeAction(0, 'grain-seeds')
  for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select', farm: { farmType: 'stable' } } })
  assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
  const continued = restore(session)
  response = continued.commitSelectionChoice(1, { stables: [{ row: 0, col: 2 }] })
  for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
    response = continued.resolveChoice(response.interaction.playerIndex, 'confirm')
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.grain).toBe(1)
  expect(response.state.players[0]!.stableTiles).toEqual([])
  expect(response.state.players[1]!.stableTiles).toEqual([{ row: 0, col: 2 }])
  expect(response.state.players[1]!.resources.wood).toBe(0)
  expect(response.state.players[1]!.cardStates.E148_Lazybones?.extraData?.reservedActionSpaces).toEqual([])
  expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.stableBuilt', actorPlayerId: 'p2', targetPlayerId: 'p2', sourceCardId: 'E148_Lazybones' }))
  expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', playerId: 'p2', params: expect.objectContaining({ detailParts: expect.objectContaining({ effects: { buildStables: 1 } }) }) }))
  expect(response.scores?.[1]?.categories.find(category => category.key === 'empty')?.total).toBe(-12)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
})

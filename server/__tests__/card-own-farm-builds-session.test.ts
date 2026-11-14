import assert from 'node:assert/strict'
import { expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { partnerTable, restorePartnerTable as restore } from './_helpers/partner-build-fixture'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { descriptionEffects } from './_helpers/choice-description'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
const table = (configure: (state: GameState) => void, playerCount = 4, moor = false) => partnerTable(configure, { playerCount, moor })

it.each([
  { card: 'C087_Mason', action: 'C87-mason-anytime', count: 4 },
  { card: 'D087_MasterBuilder', action: 'D87-master-builder-anytime', count: 5 },
])('$card keeps its own-house room local through recovery and rejects a teammate target', ({ card, action, count }) => {
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
  assertRejectedUnchanged(original, () => original.resolveChoice(0, 'target-farm:p3'))
  assertRejectedUnchanged(original, () => original.commitSelectionChoice(2, { rooms: [{ row: 0, col: 0 }] }))
  const session = restore(original)
  const built = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.rooms).toBe(count + 1)
  expect(built.state.players[0]!.cardStates[card]?.flagged).toBe(true)
  expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, stone: 0, reed: 0 })
  expect(built.state.players[2]!.rooms).toBe(2)
  expect(built.state.log.some(entry => entry.key.startsWith('log.partnerRoomsBuilt'))).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'stoneRooms')?.total).toBe((count + 1) * 2)
  expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'clayRooms')?.total).toBe(2)
})

it('Diligent Farmer extends its owner house after a real occupation purchase, not its teammate house', () => {
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
  expect(built.state.players[2]!.rooms).toBe(2)
  expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, grain: 8, vegetable: 4 })
  expect(built.state.log.some(entry => entry.key.startsWith('log.partnerRoomsBuilt'))).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'empty')?.total).toBe(-7)
})

it('Amateur Fencer only grants a pasture on its owner farm in a legal six-player game', () => {
  const card = 'C170_AmateurFencer'
  const session = table(state => {
    state.players[0]!.occupationHand = [card]
    state.players[0]!.resources.wood = 2
  }, 6)
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
  assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p4'))
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.pastures).toHaveLength(1)
  expect(built.state.players[3]!.pastures).toEqual([])
  expect(built.state.players[0]!.resources.wood).toBe(2)
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
})

it.each(['M038_NatureReserve', 'M039_SpecialPasture'])('%s keeps its lasting layout exception on its owner farm', card => {
  const session = table(state => {
    for (const player of state.players) player.farmTerrain = []
    const owner = state.players[0]!
    owner.minorHand = [card]
    owner.resources.wood = 4
    owner.resources.food = 1
    for (const player of [owner, state.players[2]!]) {
      player.fenceSegments = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      player.pastures = [{ id: 'pasture-1', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      if (card === 'M038_NatureReserve') player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
    }
  }, 4, true)
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.minorPlayed.includes(card)) {
    expect(getChoiceOptions(response).some(option => option.value === card)).toBe(true)
    response = session.resolveChoice(0, card)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.minorPlayed).toContain(card)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  assertRejectedUnchanged(session, () => session.resolveChoice(0, 'target-farm:p3'))
  const continued = restore(session)
  const col = card === 'M038_NatureReserve' ? 1 : 2
  const built = continued.commitSelectionChoice(0, { edges: [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.fenceSegments).toHaveLength(card === 'M038_NatureReserve' ? 7 : 8)
  expect(built.state.players[0]!.pastures).toHaveLength(card === 'M038_NatureReserve' ? 1 : 2)
  expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  expect(built.state.players[2]!.pastures).toHaveLength(1)
  expect(built.state.players[0]!.resources.wood).toBe(card === 'M038_NatureReserve' ? 4 : 2)
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
  expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'pastures')?.total).toBe(1)
  if (card === 'M038_NatureReserve') {
    expect(built.state.players[0]!.cardStates[card]?.extraData?.natureReserveTiles).toEqual([{ row: 0, col: 1 }])
    expect(built.state.players[2]!.cardStates[card]).toBeUndefined()
    assert.ok(built.interaction.stateId === 'wait' && built.interaction.request.kind === 'confirm-next-player')
    expect(continued.resolveChoice(built.interaction.playerIndex, 'confirm').ok).toBe(true)
    for (const [playerIndex, space] of [[1, 'grain-seeds'], [2, 'day-laborer'], [3, 'fishing']] satisfies Array<[number, string]>) {
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
    expect(cleared.state.players[2]!.farmTerrain).toEqual([{ row: 0, col: 1, kind: 'forest' }])
    expect(cleared.state.players[2]!.pastures).toHaveLength(1)
  }
})

it.each([{ cardSeats: [0] }, { cardSeats: [2] }, { cardSeats: [0, 2] }])('does not lend Farm Hand special-stable permission from card seats $cardSeats to a partner build', ({ cardSeats }) => {
  const session = table(state => {
    for (const cardSeat of cardSeats) {
      const holder = state.players[cardSeat]!
      holder.occupationPlayed = ['B085_FarmHand']
      holder.fields = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }].map(tile => ({ ...tile, stacks: [] }))
    }
    state.players[0]!.resources.wood = 3
  })
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  const selected = session.resolveChoice(0, 'target-farm:p3')
  expect(selected.ok, selected.error).toBe(true)
  assert.ok(selected.interaction.stateId === 'wait' && selected.interaction.request.kind === 'farm-select')
  expect(selected.interaction.request.farm.farmHandPositions).toBeUndefined()
  assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { farmHand: { row: 0, col: 2 } }))
  const built = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 4 }] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.stableTiles).toEqual([])
  expect(built.state.players[2]!.stableTiles).toEqual([{ row: 0, col: 4 }])
  for (const cardSeat of cardSeats) expect(built.state.players[cardSeat]!.cardStates.B085_FarmHand?.flagged).not.toBe(true)
  expect(session.withCtx(() => getExtraRoomCapacity(session.state.players[2]!))).toBe(0)
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerStablesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
})

it('builds Farm Hand on its owner farm without locking ordinary teammate stable actions', () => {
  const session = table(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['B085_FarmHand']
    owner.fields = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }].map(tile => ({ ...tile, stacks: [] }))
    owner.resources.wood = 3
  })
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  const selected = session.resolveChoice(0, 'target-farm:p1')
  expect(selected.ok, selected.error).toBe(true)
  assert.ok(selected.interaction.stateId === 'wait' && selected.interaction.request.kind === 'farm-select')
  expect(selected.interaction.request.farm.farmHandPositions).toContainEqual({ row: 0, col: 2 })
  const continued = restore(session)
  const built = continued.commitSelectionChoice(0, { farmHand: { row: 0, col: 2 } })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(1)
  expect(built.state.players[0]!.stableTiles).toEqual([])
  expect(built.state.players[0]!.cardStates.B085_FarmHand).toMatchObject({ flagged: true, extraData: { position: { row: 0, col: 2 } } })
  expect(continued.withCtx(() => getExtraRoomCapacity(continued.state.players[0]!))).toBe(1)
  expect(continued.withCtx(() => getExtraRoomCapacity(continued.state.players[2]!))).toBe(0)
  expect(built.state.log.some(entry => entry.key === 'log.partnerStablesBuilt')).toBe(false)
})

it.each([0, 2])('does not share Wood Palisades from card seat %i across farms in quotes or commits', cardSeat => {
  const session = table(state => {
    state.players[cardSeat]!.minorPlayed = ['B030_WoodPalisades']
    state.players[0]!.resources.wood = 8
  })
  expect(session.takeAction(0, 'fencing').ok).toBe(true)
  const selected = session.resolveChoice(0, 'target-farm:p3')
  expect(selected.ok, selected.error).toBe(true)
  assert.ok(selected.interaction.stateId === 'wait' && selected.interaction.request.kind === 'farm-select')
  assert.ok(selected.interaction.requestKey)
  const forged = { edges: ['H-1-2', 'V-0-2', 'V-0-3'], palisadeEdges: ['H-0-2'] }
  const quote = session.quoteFenceSelection(0, selected.interaction.requestKey, forged)
  expect(quote.valid).toBe(false)
  assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, forged))
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(2)
  expect(built.state.players[2]!.fenceSegments).toHaveLength(4)
  expect(built.state.players[2]!.fenceSegments?.every(segment => segment.type === 'fence')).toBe(true)
  expect(built.scores?.find(score => score.playerId === 'p3')?.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
})

it('keeps paid own-farm Wood Palisades and its card score through a pending restore', () => {
  const session = table(state => {
    state.players[0]!.minorPlayed = ['B030_WoodPalisades']
    state.players[0]!.resources.wood = 6
  })
  expect(session.takeAction(0, 'fencing').ok).toBe(true)
  expect(session.resolveChoice(0, 'target-farm:p1').ok).toBe(true)
  const continued = restore(session)
  const built = continued.commitSelectionChoice(0, { edges: ['H-1-2', 'V-0-2', 'V-0-3'], palisadeEdges: ['H-0-2'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(1)
  expect(built.state.players[0]!.fenceSegments?.filter(segment => segment.type === 'palisade')).toHaveLength(1)
  expect(built.state.players[2]!.fenceSegments).toEqual([])
  expect(built.scores?.find(score => score.playerId === 'p1')?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
})

it('leaves both Ash Trees card stocks untouched when building ordinary teammate fences', () => {
  const session = table(state => {
    for (const player of [state.players[0]!, state.players[2]!]) {
      player.minorPlayed = ['E074_AshTrees']
      player.cardStates.E074_AshTrees = { counters: { fences: 5 } }
    }
    state.players[0]!.resources.wood = 6
  })
  expect(session.takeAction(0, 'fencing').ok).toBe(true)
  const selected = session.resolveChoice(0, 'target-farm:p3')
  expect(selected.ok, selected.error).toBe(true)
  expect(selected.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
  const built = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'] })
  expect(built.ok, built.error).toBe(true)
  expect(built.state.players[0]!.resources.wood).toBe(0)
  expect(built.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences).toBe(5)
  expect(built.state.players[2]!.cardStates.E074_AshTrees?.counters?.fences).toBe(5)
  expect(built.state.players[2]!.pastures).toHaveLength(1)
  expect(built.state.players[0]!.pastures).toEqual([])
  expect(built.state.log).toContainEqual(expect.objectContaining({ key: 'log.partnerFencesBuilt', playerId: 'p1', playerRefs: { owner: 'p3' } }))
})

it('offers card-held Ash Trees pieces only for self building and preserves their reservation across recovery', () => {
  const session = table(state => {
    state.players[0]!.minorPlayed = ['E074_AshTrees']
    state.players[0]!.cardStates.E074_AshTrees = { counters: { fences: 5 } }
    state.players[0]!.resources.wood = 2
  })
  const offered = session.takeAction(0, 'fencing')
  expect(offered.ok, offered.error).toBe(true)
  expect(getChoiceOptions(offered).some(option => option.value === 'target-farm:p3')).toBe(false)
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
  expect(built.state.players[2]!.pastures).toEqual([])
  expect(built.state.log.some(entry => entry.key === 'log.partnerFencesBuilt')).toBe(false)
})
it('Lazybones keeps its owner target despite a legal teammate after pending recovery', () => {
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
  assertRejectedUnchanged(session, () => session.resolveChoice(1, 'target-farm:p4'))
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

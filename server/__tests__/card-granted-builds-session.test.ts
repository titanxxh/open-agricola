import assert from 'node:assert/strict'
import { expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { partnerTable, restorePartnerTable } from './_helpers/partner-build-fixture'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
const table = (configure: (state: GameState) => void, playerCount=4, moor=false) => partnerTable(configure, {playerCount, moor})

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
  const continued = restorePartnerTable(session)
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

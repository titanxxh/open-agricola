// Helpers of ae-negative-02-placement-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { familySize, setActiveWorkerCount, setWorkersAtHome } from '../../../../shared/domain/player'
import { findActionSpaceById } from '../../../../shared/domain/space'
import { getRoundPersonPlacementDetails } from '../../../../shared/cards/helpers/round-placement'

export const sessions: GameSession[] = []
export const A130 = 'A130_MummysBoy'
export const D094 = 'D094_HenpeckedHusband'
export const E151 = 'E151_DeliveryNurse'
export function setup(card: string, { family = 2, players = 3, round = 5 } = {}) {
  const session = createWorkSession({ seed: 42, options: { playerCount: players }, configure: state => {
    state.round = round
    state.players.forEach(p => { p.resources.food = 20 })
    const p = state.players[0]!
    p.occupationPlayed = [card]
    p.resources.food = 0
    setActiveWorkerCount(p, family)
    setWorkersAtHome(state, p, family)
    if (family > 2 && card === A130) {
      p.rooms = family
      p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, family)
    }
  } })
  sessions.push(session)
  return session
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function ready(session: GameSession, actor: number) {
  let r = session.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(session, r)
  assert.equal(r.interaction.stateId, 'idle')
  assert.equal(r.state.currentPlayerIndex, actor)
  return r
}
export function turn(session: GameSession, actor: number, space: string) {
  ready(session, actor)
  let r = ok(session.takeAction(actor, space))
  if (space === 'meeting-place' && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const skip = r.interaction.request.options.find(o => o.value === '__skip__' || o.value === '__done__')
    assert.ok(skip)
    r = ok(session.resolveChoice(actor, skip.value))
  }
  return r
}
export function secondPerson(session: GameSession, target = 'day-laborer') {
  turn(session, 0, 'forest')
  turn(session, 1, 'clay-pit')
  turn(session, 2, 'reed-bank')
  ready(session, 0)
  assertRejectedUnchanged(session, () => session.takeAction(0, 'forest'))
  turn(session, 0, target)
  turn(session, 1, 'grain-seeds')
  turn(session, 2, 'fishing')
  ready(session, 0)
  assert.equal(getRoundPersonPlacementDetails(session.state.players[0]!).length, 2)
}
export function occupants(r: SessionResponse, space: string) {
  return findActionSpaceById(r.state, space)!.takenBy.filter(w => w.playerId === r.state.players[0]!.id)
}
export function husbandSetup(hardworking = false) {
  const session = createWorkSession({ seed: 42, options: { playerCount: 3 }, configure: state => {
    state.round = 10
    state.players.forEach(p => { p.resources.food = 20 })
    const p = state.players[0]!
    p.occupationPlayed = hardworking ? [D094, 'D127_HardworkingMan'] : [D094]
    p.resources.wood = 20
    p.resources.reed = 10
    state.players.slice(1).forEach(other => {
      other.rooms = 4
      other.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]
    })
  } })
  sessions.push(session)
  return session
}
export function husbandFirst(session: GameSession, first = 'forest') {
  turn(session, 0, first)
  turn(session, 1, 'clay-pit')
  turn(session, 2, 'reed-bank')
  ready(session, 0)
  const firstPlacement = getRoundPersonPlacementDetails(session.state.players[0]!)[0]
  assert.ok(firstPlacement)
  return firstPlacement.workerId
}
export function choose(session: GameSession, r: SessionResponse, labelKey: string) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  const option = r.interaction.request.options.find(o => o.labelKey === labelKey)
  assert.ok(option, JSON.stringify(r.interaction))
  return ok(session.resolveChoice(0, option.value))
}
export function finishFarm(session: GameSession, mode: 'room' | 'stable', space = 'farm-expansion', rejectTile = false) {
  let r = turn(session, 0, space)
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    r = choose(session, r, mode === 'room' ? 'actions.construct.name' : 'actions.stables.name')
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
  const farm = r.interaction.request.farm
  assert.equal(farm.farmType, mode)
  assert.ok(farm.farmType === 'room' || farm.farmType === 'stable')
  const tile = farm.selectableTiles[0]!
  assert.ok(tile)
  if (rejectTile) assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 0 }] }))
  r = ok(session.commitSelectionChoice(0, mode === 'room' ? { rooms: [tile] } : { stables: [tile] }))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const done = r.interaction.request.options.find(o => o.value === '__done__' || o.value === '__skip__')
    assert.ok(done, JSON.stringify(r.interaction))
    r = ok(session.resolveChoice(0, done.value))
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  return r
}
export function firstAt(r: SessionResponse, space: string, workerId: string) {
  return occupants(r, space).some(w => w.workerId === workerId)
}
export function nurseSetup({ family = 2, missing = false, shed = false, round = 10 } = {}) {
  const session = createWorkSession({ seed: 42, options: { playerCount: 4 }, configure: state => {
    state.round = round
    state.players.forEach(p => { p.resources.food = 20 })
    const p = state.players[0]!
    p.occupationPlayed = [E151]
    p.minorPlayed = shed ? ['A010_WoodenShed'] : []
    p.resources.food = 0
    p.resources.sheep = 1
    p.resources.boar = 1
    p.resources.cattle = missing ? 0 : 1
    p.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]
    p.stableAnimals = { '0-1': { animalType: 'sheep', animalCount: 1 }, '0-2': { animalType: 'boar', animalCount: 1 }, ...(missing ? {} : { '0-3': { animalType: 'cattle' as const, animalCount: 1 } }) }
    setActiveWorkerCount(p, family)
    setWorkersAtHome(state, p, family)
  } })
  sessions.push(session)
  assert.equal(familySize(session.state.players[0]!), family)
  assert.equal(session.state.players[0]!.rooms, 2)
  assert.deepEqual(session.state.players[0]!.resources.sheep, 1)
  assert.equal(session.state.players[0]!.stableTiles.length, 3)
  return session
}
export function nurseGrowth(session: GameSession, space = 'wish-children') {
  let r = ok(session.takeAction(0, space))
  let offer = false
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const option = r.interaction.request.options.find(o => o.sourceCard === E151)
    if (option) {
      offer = true
      r = ok(session.resolveChoice(0, option.value))
    }
  }
  assert.equal(familySize(r.state.players[0]!), 3)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
  return { r, offer }
}
export function nurseTotals(r: SessionResponse) {
  const p = r.state.players[0]!
  return { family: familySize(p), sheep: p.resources.sheep, boar: p.resources.boar, cattle: p.resources.cattle, food: p.resources.food, used: p.cardStates[E151]?.flagged === true }
}
export function finishNurseRound(s: GameSession) {
  turn(s, 1, 'forest')
  turn(s, 2, 'clay-pit')
  turn(s, 3, 'reed-bank')
  turn(s, 0, 'grain-seeds')
  turn(s, 1, 'day-laborer')
  turn(s, 2, 'fishing')
  const r = turn(s, 3, 'farmland')
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
  ok(s.commitSelectionChoice(3, { tile: r.interaction.request.farm.selectableTiles[0]! }))
  ready(s, 0)
}

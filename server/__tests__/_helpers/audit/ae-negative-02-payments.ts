// Helpers of ae-negative-02-payments-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import { confirmNext } from '../negative-rule-audit'
import '../../../../shared/cards/B/B157_Salter'
import '../../../../shared/cards/A/A143_Stonecutter'
import '../../../../shared/cards/C/C094_StableCleaner'
import '../../../../shared/cards/E/E146_Reseller'
import '../../../../shared/cards/E/E047_SyrupTap'
import '../../../../shared/cards/E/E030_ChildsToy'
import '../../../../shared/cards/B/B007_Wage'
import '../../../../shared/cards/C/C054_MarketBooth'

export const SALTER = 'B157_Salter'
export function salter({ round = 5, sheep = 2, played = true, reserveBoar = 0, farmBoar = 0, farmCattle = 0, allWorkersUsed = false } = {}) {
  return createWorkSession({ seed: 2157, options: { playerCount: 4 }, configure(state) {
    state.round = round
    const owner = state.players[0]!
    owner.occupationPlayed = played ? [SALTER] : []
    Object.assign(owner.resources, { sheep, boar: reserveBoar + farmBoar, cattle: farmCattle, food: 20 })
    owner.pastures = [{ id: 'sheep-pasture', tiles: [{ row: 0, col: 2 }], animalType: sheep ? 'sheep' : null, animalCount: sheep }]
    if (farmBoar) owner.pastures.push({ id: 'boar-pasture', tiles: [{ row: 0, col: 3 }], animalType: 'boar', animalCount: farmBoar })
    if (farmCattle) owner.pastures.push({ id: 'cattle-pasture', tiles: [{ row: 0, col: 4 }], animalType: 'cattle', animalCount: farmCattle })
    if (allWorkersUsed) state.players.forEach(p => markAllWorkersUsed(state, p))
  } })
}
export function wait(response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
  return response.interaction
}
export function salterChoice(session: GameSession) {
  const r = session.takeAnytimeAction(0, 'B157-salter-anytime')
  assert.equal(wait(r).request.kind, 'resource-quantity-select')
  return r
}
export const future = (r: SessionResponse) => r.state.futureMeeples.filter(m => m.cardId === SALTER).flatMap(m => Array.from({ length: m.resources.food ?? 0 }, () => m.round)).sort((a, b) => a - b)
export const salterObserved = (r: SessionResponse) => ({ sheep: r.state.players[0]!.resources.sheep, food: r.state.players[0]!.resources.food, farmSheep: r.state.players[0]!.pastures[0]!.animalCount, rounds: future(r) })
export const CLEANER = 'C094_StableCleaner'
export function cleaner({ wood = 2, food = 2, played = true, supply = 4 } = {}) {
  return createWorkSession({ seed: 2094, configure(state) {
    const p = state.players[0]!
    p.occupationPlayed = played ? [CLEANER] : []
    Object.assign(p.resources, { wood, food })
    p.stableTiles = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 2 }].slice(0, 4 - supply)
  } })
}
export const cleanerObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, stables: r.state.players[0]!.stableTiles.length, workers: r.state.actionSpaces.reduce((n, space) => n + space.takenBy.filter(w => w.playerId === r.state.players[0]!.id).length, 0) })
export function enterCleaner(s: GameSession) {
  const r = s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
  assert.equal(wait(r).request.kind, 'farm-select')
  return r
}
export const RESELLER = 'E146_Reseller'
export function reseller({ wood = 1, stone = 1, clay = 1, discounted = false } = {}) {
  return createWorkSession({ seed: 2146, options: { playerCount: 3 }, configure(state) {
    state.round = 14
    state.availableMajorImprovements = []
    const p = state.players[0]!
    p.occupationPlayed = discounted ? [RESELLER, 'A143_Stonecutter'] : [RESELLER]
    p.minorHand = ['E047_SyrupTap', 'E030_ChildsToy', 'B007_Wage', 'C054_MarketBooth']
    Object.assign(p.resources, { wood, stone, clay, food: 0, reed: 0 })
  } })
}
export function options(r: SessionResponse) {
  const request = wait(r).request
  assert.equal(request.kind, 'choice')
  assert.ok(request.kind === 'choice')
  return request.options
}
export function playMinor(s: GameSession, cardId: string, action = 'meeting-place') {
  let r = s.takeAction(0, action)
  assert.equal(r.ok, true, r.error)
  for (let guard = 0; guard < 6 && r.state.players[0]!.minorHand.includes(cardId); guard++) {
    const available = options(r)
    const option = available.find(o => o.value === cardId)
      ?? available.find(o => o.value.startsWith('action-improvement-'))
      ?? available.find(o => (o.effectPreview?.kind === 'payment' || o.effectPreview?.kind === 'resourceExchange') && o.effectPreview.resourcesPaid?.clay === 1)
    assert.ok(option, JSON.stringify(r.interaction))
    r = s.resolveChoice(0, option.value)
    assert.equal(r.ok, true, r.error)
  }
  assert.ok(r.state.players[0]!.minorPlayed.includes(cardId) || r.state.players[1]!.minorHand.includes(cardId), cardId)
  return r
}
export function acceptRefund(s: GameSession, initial: SessionResponse) {
  let r = initial
  const trigger = options(r).find(o => o.value === RESELLER)
  if (trigger) { r = s.resolveChoice(0, trigger.value); assert.equal(r.ok, true, r.error) }
  const option = options(r).find(o => o.sourceCard === RESELLER && o.value !== '__skip__')
  assert.ok(option, JSON.stringify(r.interaction))
  r = s.resolveChoice(0, option.value)
  assert.equal(r.ok, true, r.error)
  return { r, value: option.value }
}
export const resellerObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, stone: r.state.players[0]!.resources.stone, clay: r.state.players[0]!.resources.clay, used: r.state.players[0]!.cardStates[RESELLER]?.flagged === true })
export function rotateToOwner(s: GameSession, initial: SessionResponse) {
  let r = confirmNext(s, initial)
  assert.equal(r.state.currentPlayerIndex, 1)
  r = confirmNext(s, s.takeAction(1, 'grain-seeds'))
  assert.equal(r.state.currentPlayerIndex, 2)
  r = confirmNext(s, s.takeAction(2, 'day-laborer'))
  assert.equal(r.state.currentPlayerIndex, 0)
  return r
}

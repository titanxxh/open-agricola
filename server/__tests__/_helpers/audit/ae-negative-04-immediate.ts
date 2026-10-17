// Helpers of ae-negative-04-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import { countRoomAnimals } from '../../../../shared/domain/animals'
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged } from '../negative-rule-audit'
import '../../../../shared/cards/A/A006_StorageBarn'
import '../../../../shared/cards/A/A008_FoodBasket'
import '../../../../shared/cards/A/A009_YoungAnimalMarket'

export const BARN = 'A006_StorageBarn'
export const BASKET = 'A008_FoodBasket'
export const MARKET = 'A009_YoungAnimalMarket'
export const MAJORS = ['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']
export const sessions: GameSession[] = []
export function setup(card: string, { ownMajors = [], opponentMajors = [], occupations = 0, improvements = 0, resources = {}, opponentPrerequisites = false, inHand = true }: { ownMajors?: string[]; opponentMajors?: string[]; occupations?: number; improvements?: number; resources?: Partial<PlayerState['resources']>; opponentPrerequisites?: boolean; inHand?: boolean } = {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    state.players.forEach(p => {
      p.minorHand = ['B007_Wage', 'A054_Credit']
      p.occupationHand = ['__test_placeholder__']
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, cattle: 0 })
    })
    const p = state.players[0]!
    if (inHand) p.minorHand.push(card)
    else state.players[1]!.minorHand.push(card)
    p.improvements = ownMajors
    if (card === MARKET && resources.sheep === 1) p.minorPlayed = ['A017_ReclamationPlow']
    state.players[1]!.improvements = opponentMajors
    const target = state.players[opponentPrerequisites ? 1 : 0]!
    target.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations)
    target.minorPlayed = ['A041_VegetableSlicer', 'B010_Caravan'].slice(0, improvements)
    Object.assign(p.resources, resources)
    if (resources.cattle === 1) { p.houseAnimals = { '2-0': 'cattle' }}
  } })
  sessions.push(s)
  return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function options(r: SessionResponse) {
  ok(r)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function enter(s: GameSession) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
  if (branch) r = ok(s.resolveChoice(0, branch.value))
  return r
}
export function buy(s: GameSession, r: SessionResponse, card: string) {
  assert.ok(options(r).some(o => o.value === card))
  return ok(s.resolveChoice(0, card))
}
export function passed(r: SessionResponse, card: string) {
  const p = r.state.players[0]!
  assert.equal(p.minorHand.includes(card), false)
  assert.equal(p.minorPlayed.includes(card), false)
  assert.equal(r.state.players[1]!.minorHand.filter(id => id === card).length, 1)
  assert.equal(r.state.roundPhase, 'work')
  assert.deepEqual([r.state.players[1]!.resources.stone,r.state.players[1]!.resources.wood,r.state.players[1]!.resources.clay,r.state.players[1]!.resources.reed,r.state.players[1]!.resources.grain,r.state.players[1]!.resources.vegetable,r.state.players[1]!.resources.sheep,r.state.players[1]!.resources.cattle], [0,0,0,0,0,0,0,0])
  assert.equal(r.scores?.length, 2)
  const plays = r.state.events.filter(event => 'fromPlayerId' in event && event.cardId === card)
  assert.equal(plays.length, 1)
  const play = plays[0]!
  assert.ok('fromPlayerId' in play)
  assert.equal(play.fromPlayerId, p.id)
  assert.equal(play.toPlayerId, r.state.players[1]!.id)
  const payments = r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === card)
  const expectedCost = card === BASKET ? { reed: 1 } : card === MARKET ? { sheep: 1 } : {}
  assert.equal(payments.length, Object.keys(expectedCost).length ? 1 : 0)
  if (payments.length) {
    const payment = payments[0]!
    assert.ok(payment.type === 'resource.paid')
    assert.deepEqual(payment.resources, expectedCost)
  }
  const rewards = r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.reason === 'cardEffect')
  const expectedGain = card === BASKET ? { grain: 1, vegetable: 1 } : card === MARKET ? { cattle: 1 } : {
    ...(p.improvements.includes('Major_Well') ? { stone: 1 } : {}),
    ...(p.improvements.includes('Major_Joinery') ? { wood: 1 } : {}),
    ...(p.improvements.includes('Major_Pottery') ? { clay: 1 } : {}),
    ...(p.improvements.includes('Major_Basket') ? { reed: 1 } : {}),
  }
  assert.equal(rewards.length, Object.keys(expectedGain).length ? 1 : 0)
  if (rewards.length) {
    const reward = rewards[0]!
    assert.ok(reward.type === 'resource.moved')
    assert.deepEqual(reward.resources, expectedGain)
    assert.deepEqual(reward.to, { kind: 'player', playerId: p.id })
  }
}
export function resources(r: SessionResponse) {
  const p = r.state.players[0]!.resources
  return { stone: p.stone, wood: p.wood, clay: p.clay, reed: p.reed, grain: p.grain, vegetable: p.vegetable, sheep: p.sheep, cattle: p.cattle }
}
export const ZERO = { stone: 0, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0 }
export function noRepeat(s: GameSession, card: string) { assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function housed(s: GameSession, r: SessionResponse) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
  const placed = ok(s.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }] }))
  assert.equal(placed.state.players[0]!.houseAnimals['2-0'], 'cattle')
  assert.equal(countRoomAnimals(placed.state.players[0]!), 1)
  return placed
}

// Helpers of ae-negative-03-costs-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import '../../../../shared/cards/D/D117_WoodExpert'
import '../../../../shared/cards/D/D033_SummerHouse'
import '../../../../shared/cards/B/B081_Handcart'
import '../../../../shared/cards/B/B007_Wage'
import '../../../../shared/cards/E/E047_SyrupTap'
import '../../../../shared/cards/E/E030_ChildsToy'
import '../../../../shared/cards/E/E156_ClaypitOwner'
import '../../../../shared/cards/C/C041_FarmStore'
import '../../../../shared/cards/C/C122_Bricklayer'
import '../../../../shared/cards/C/C054_MarketBooth'

export function options(r: SessionResponse) {
  assert.equal(r.ok, true, r.error)
  assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
  const request = r.interaction.request
  assert.ok(request.kind === 'choice', JSON.stringify(request))
  return request.options
}
export function enterImprovement(s: GameSession, actor = 0, space = 'meeting-place') {
  let r = s.takeAction(actor, space)
  const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
  if (branch) r = s.resolveChoice(actor, branch.value)
  return r
}
export function chooseCard(s: GameSession, r: SessionResponse, card: string, actor = 0) {
  assert.ok(options(r).some(o => o.value === card), JSON.stringify(r.interaction))
  return s.resolveChoice(actor, card)
}
export function woodExpert(resources: Partial<Resource> = {}, played = true) {
  return createWorkSession({ seed: 3117, configure(state) {
    state.round = 14
    const p = state.players[0]!
    p.occupationPlayed = played ? ['D117_WoodExpert'] : []
    p.occupationHand = played ? ['__test_placeholder__'] : ['D117_WoodExpert', 'A116_WoodCutter']
    p.minorHand = ['D033_SummerHouse', 'B081_Handcart', 'E047_SyrupTap', 'B007_Wage']
    Object.assign(p.resources, { wood: 0, clay: 0, stone: 0, food: 0, ...resources })
  } })
}
export const costObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, stone: r.state.players[0]!.resources.stone, food: r.state.players[0]!.resources.food, built: r.state.players[0]!.minorPlayed.includes('D033_SummerHouse') })
export function claypit({ self = false, wood = 1, stone = 1, clay = 0, discounted = false } = {}) {
  return createWorkSession({ seed: 3156, options: { playerCount: 4 }, configure(state) {
    state.round = 14
    state.players[0]!.occupationPlayed = ['E156_ClaypitOwner']
    state.players.forEach(p => Object.assign(p.resources, { food: 0, clay: 0, wood: 0, stone: 0 }))
    const actor = state.players[self ? 0 : 1]!
    actor.minorHand = ['E030_ChildsToy', 'E047_SyrupTap', 'B007_Wage', 'C054_MarketBooth']
    Object.assign(actor.resources, { wood, stone, clay })
    if (discounted) actor.occupationPlayed = ['C122_Bricklayer']
  } })
}
export function toOpponent(s: GameSession) {
  const r = confirmNext(s, s.takeAction(0, 'grain-seeds'))
  assert.equal(r.state.currentPlayerIndex, 1)
}
export const clayObserved = (r: SessionResponse) => ({ ownerFood: r.state.players[0]!.resources.food, ownerClay: r.state.players[0]!.resources.clay, actorWood: r.state.players[1]!.resources.wood, built: r.state.players[1]!.minorPlayed.includes('E030_ChildsToy') })
export function finishForeign(s: GameSession, initial: SessionResponse) {
  let r = initial
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
    r = s.resolveChoice(r.interaction.playerIndex, 'confirm')
    assert.equal(r.ok, true, r.error)
  }
  return r
}
export const pairs = [{ wood: 1, clay: 1 }, { wood: 1, stone: 1 }, { wood: 1, reed: 1 }, { clay: 1, stone: 1 }, { clay: 1, reed: 1 }, { stone: 1, reed: 1 }]
export function farmStore(food = 5, round = 4) {
  return createWorkSession({ seed: 3041, configure(state) {
    state.round = round
    state.players[0]!.minorPlayed = ['C041_FarmStore']
    state.players.forEach((p, index) => {
      Object.assign(p.resources, { food: index === 0 ? food : 20, wood: 0, clay: 0, reed: 0, stone: 0, vegetable: 0 })
      markAllWorkersUsed(state, p)
    })
  } })
}
export const storeObserved = (r: SessionResponse) => {
  const p = r.state.players[0]!
  return { food: p.resources.food, vegetable: p.resources.vegetable, wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone }
}
export function storeChoice(s: GameSession, initial: SessionResponse) {
  let r = initial
  const trigger = options(r).find(o => o.value === 'C041_FarmStore')
  if (trigger) r = s.resolveChoice(0, trigger.value)
  assert.equal(r.state.players[0]!.resources.food, 1)
  return r
}
export function exchange(s: GameSession, r: SessionResponse, gain: Partial<Resource>) {
  const choice = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && Object.entries(gain).every(([key, n]) => o.effectPreview?.kind === 'resourceExchange' && Object.entries(o.effectPreview.resourcesGained ?? {}).some(([k,v]) => k === key && v === n)))
  assert.ok(choice, JSON.stringify(r.interaction))
  const selected = s.resolveChoice(0, choice.value)
  assert.equal(selected.ok, true, selected.error)
  return { r: selected, value: choice.value }
}

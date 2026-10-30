// Helpers of ae-negative-05-fields-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import '../../../../shared/cards/A/A016_RammedClay'
import '../../../../shared/cards/A/A017_ReclamationPlow'
import '../../../../shared/cards/A/A019_Handplow'
import '../../../../shared/cards/A/A009_YoungAnimalMarket'

export const RAMMED = 'A016_RammedClay', RECLAMATION = 'A017_ReclamationPlow', HANDPLOW = 'A019_Handplow'
export const ONE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export const sessions: GameSession[] = []
export function setup(card: string, { played = true, round = 5, resources = {}, configure = () => {} }: { played?: boolean; round?: number; resources?: Partial<PlayerState['resources']>; configure?: (state: GameState) => void } = {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    state.players.forEach(p => {
      p.minorHand = ['B007_Wage', 'A054_Credit']
      p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[0]!
    if (played) p.minorPlayed = [card]
    else p.minorHand.push(card)
    Object.assign(p.resources, resources)
    configure(state)
  } })
  sessions.push(s)
  return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
  ok(r)
  assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function enter(s: GameSession) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
  if (branch) r = ok(s.resolveChoice(0, branch.value))
  return r
}
export function buy(s: GameSession, r: SessionResponse, card: string) {
  assert.ok(choices(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
  const played=ok(s.resolveChoice(0,card))
  if ([RAMMED,RECLAMATION,HANDPLOW].includes(card)) {
    assert.equal(played.state.players[0]!.minorPlayed.includes(card),true)
    assert.equal(played.state.players[0]!.minorHand.includes(card),false)
    const events=played.state.events.filter(event=>event.type==='card.played' && event.cardId===card)
    assert.equal(events.length,1)
    const event=events[0]!
    assert.ok(event.type==='card.played')
    assert.equal(event.actorPlayerId,played.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources??{},card===RAMMED?{}:{wood:1})
    if(card===RAMMED){
      const gains=played.state.events.filter(e=>e.type==='resource.moved' && e.sourceCardId===RAMMED && e.reason==='cardEffect')
      assert.equal(gains.length,1)
      const gain=gains[0]!
      assert.ok(gain.type==='resource.moved')
      assert.deepEqual(gain.resources,{clay:1})
    }
  }
  return played
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
  assert.equal(r.state.currentPlayerIndex, actor)
  return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function fence(s: GameSession, wood: number, clay: number) {
  const entered = ok(s.takeAction(0, 'fencing'))
  assert.ok(entered.interaction.stateId === 'wait' && entered.interaction.request.kind === 'farm-select' && entered.interaction.request.farm.farmType === 'fence')
  let r = ok(s.commitSelectionChoice(0, { edges: ONE, palisadeEdges: [] }))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const payments = choices(r)
    assert.ok(payments.every(o => o.effectPreview?.kind !== 'payment' || Object.values(o.effectPreview.resourcesPaid ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0) === 4))
    const option = payments.find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.wood ?? 0) === wood && (o.effectPreview.resourcesPaid?.clay ?? 0) === clay)
    assert.ok(option, JSON.stringify(r.interaction))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay:fencing:forged-three-clay'))
    r = ok(s.resolveChoice(0, option.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, option.value))
  }
  assert.equal(r.state.players[0]!.fenceSegments.length, 4)
  assert.equal(r.state.players[0]!.pastures.length, 1)
  assert.ok(r.scores)
  const score=r.scores[0]!.categories.find(category=>category.key==='pastures')
  assert.equal(score?.quantity,1);assert.equal(score?.total,1)
  return r
}
export function pasture(state: GameState) {
  const p = state.players[0]!
  p.fenceSegments = ONE.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  p.pastures = [{ id: 'pasture', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]
}
export function reclamation({ sheep = 1, existingField = false, resources = {} }: { sheep?: number; existingField?: boolean; resources?: Partial<PlayerState['resources']> } = {}) {
  return setup(RECLAMATION, { resources, configure(state) {
    pasture(state)
    const market = state.actionSpaces.find(space => space.id === 'sheep-market')
    assert.ok(market); market.resources.sheep = sheep
    if (existingField) state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
  } })
}
export function keep(s: GameSession, count: number, actor = 0, house = false) {
  const r = s.getState()
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
  const placed = ok(s.resolveChoice(actor, 'confirm', { zones: [{ id: house ? 'house:2-0' : 'pasture', zoneType: house ? 'house' : 'pasture', animalType: 'sheep', animalCount: count }] }))
  assert.equal(placed.state.players[actor]!.resources.sheep, count)
  return placed
}
export function trigger(s: GameSession, initial: SessionResponse, card = RECLAMATION) {
  let r = initial
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
    const option = r.interaction.request.options.find(o => o.value === card || o.sourceCard === card)
    assert.ok(option); r = ok(s.resolveChoice(r.interaction.playerIndex, option.value))
  }
  return r
}
export function accept(s: GameSession, r: SessionResponse, actor = 0) {
  const option = choices(r).find(o => !['__skip__', '__done__', '__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name' && !('disabled' in o && o.disabled))
  assert.ok(option)
  return ok(s.resolveChoice(actor, option.value))
}
export function plow(s: GameSession, r: SessionResponse, tile = { row: 1, col: 2 }, expectedFields=1) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
  const placed=ok(s.commitSelectionChoice(0,{tile}))
  assert.ok(placed.scores)
  const score=placed.scores[0]!.categories.find(category=>category.key==='fields')
  assert.equal(score?.quantity,expectedFields);assert.equal(score?.total,expectedFields===2?1:-1)
  return placed
}
export function obtainedSheep(r:SessionResponse) {
  return r.state.events.reduce((sum,event)=>event.type==='resource.moved'&&event.from.kind==='actionSpace'&&event.from.spaceId==='sheep-market'&&event.to.kind==='player'&&event.to.playerId===r.state.players[0]!.id?sum+(event.resources.sheep??0):sum,0)
}
export function flagged(r: SessionResponse) { return r.state.players[0]!.cardStates[RECLAMATION]?.flagged === true }
export function nextRound(s: GameSession) {
  turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds')
  const r = confirmNext(s, turn(s, 1, 'clay-pit'))
  assert.equal(r.state.round, 6)
  return r
}
export function future(r: SessionResponse) {
  return r.state.futureMeeples.filter(m => m.cardId === HANDPLOW).map(m => ({ round: m.round, resources: m.resources, owner: m.playerId }))
}
export function due({ existingField = false } = {}) {
  const s = setup(HANDPLOW, { played: false, resources: { wood: 1 }, configure(state) { if (existingField) state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }] } })
  const played = buy(s, enter(s), HANDPLOW)
  assert.deepEqual(future(played), [{ round: 10, resources: { field: 1 }, owner: played.state.players[0]!.id }])
  const state = s.getState().state
  state.round = 9
  state.players.forEach(p => { p.resources.food = 20; markAllWorkersUsed(state, p) })
  s.loadState(state)
  const r = ok(s.performRoundEnd())
  assert.equal(r.state.round, 10)
  assert.equal(r.state.players[0]!.fields.length, existingField ? 1 : 0)
  return { s, r }
}

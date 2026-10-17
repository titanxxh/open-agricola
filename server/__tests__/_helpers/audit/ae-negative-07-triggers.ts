// Helpers of ae-negative-07-triggers-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import '../../../../shared/cards/A/A042_ForestLakeHut'
import '../../../../shared/cards/A/A043_FarmyardManure'
import '../../../../shared/cards/A/A046_ClawKnife'
import '../../../../shared/cards/A/A089_StablePlanner'
import '../../../../shared/cards/A/A006_StorageBarn'

export const HUT = 'A042_ForestLakeHut', MANURE = 'A043_FarmyardManure', KNIFE = 'A046_ClawKnife'
export const sessions: GameSession[] = []
export function setup(card: string, { played = true, round = 5, resources = {}, configure = () => {} }: { played?: boolean; round?: number; resources?: Partial<PlayerState['resources']>; configure?: (state: GameState) => void } = {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    state.players.forEach(p => {
      p.minorHand = ['B007_Wage', 'A054_Credit']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[0]!
    if (played) p.minorPlayed = [card]; else p.minorHand.push(card)
    Object.assign(p.resources, resources); configure(state)
  } })
  sessions.push(s); return s
}
export function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'sheep' | 'cattle', count: number) {
  const action = state.actionSpaces.find(a => a.id === space); assert.ok(action)
  action.resources[resource] = count
}
export function pet(state: GameState, actor = 0) { const p = state.players[actor]!; p.houseAnimals = { '2-0': 'sheep' }; p.resources.sheep = 1 }
export function pasture(state: GameState, count = 1) {
  const p = state.players[0]!
  p.pastures = Array.from({ length: count }, (_, n) => ({ id: `pasture-${n + 1}`, tiles: [{ row: 0, col: n + 1 }], animalType: null, animalCount: 0 }))
  p.fenceSegments = Array.from({ length: count }, (_, n) => [`H-0-${n + 1}`, `H-1-${n + 1}`, `V-0-${n + 1}`, `V-0-${n + 2}`]).flat().filter((e, i, edges) => edges.indexOf(e) === i).map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
}
export function knife({ played = true, round = 5, pastures = 1, resources = {}, configure = () => {} }: { played?: boolean; round?: number; pastures?: number; resources?: Partial<PlayerState['resources']>; configure?: (state: GameState) => void } = {}) {
  return setup(KNIFE, { played, round, resources, configure(state) { pasture(state, pastures); stock(state, 'sheep-market', 'sheep', 1); configure(state) } })
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] { ok(r); assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function enter(s: GameSession) {
  let r = turn(s, 0, 'meeting-place'); const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
  if (branch) r = ok(s.resolveChoice(0, branch.value)); return r
}
export function offered(r: SessionResponse, card: string) { return choices(r).some(o => o.value === card && !o.disabled) }
export function buy(s: GameSession, r: SessionResponse, card: string) {
  assert.equal(offered(r, card), true); const result = ok(s.resolveChoice(0, card))
  assert.equal(result.state.players[0]!.minorPlayed.includes(card), true); assert.equal(result.state.players[0]!.minorHand.includes(card), false)
  const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card); assert.equal(events.length, 1)
  const event = events[0]!; assert.ok(event.type === 'card.played'); assert.equal(event.actorPlayerId, result.state.players[0]!.id)
  assert.deepEqual(event.payment?.resources ?? {}, card === HUT ? { clay: 2 } : card === KNIFE ? { wood: 1 } : {})
  return result
}
export function printedPoint(r: SessionResponse, card: string) { assert.ok(r.scores); assert.equal(r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === card)?.score, 1) }
export function future(r: SessionResponse, card: string) { return r.state.futureMeeples.filter(m => m.cardId === card && m.playerId === r.state.players[0]!.id).flatMap(m => { assert.deepEqual(m.resources, { food: 1 }); return [m.round] }).sort((a, b) => a - b) }
export function stableSelect(s: GameSession, actor = 0) {
  let r = turn(s, actor, 'farm-expansion')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const option = choices(r).find(o => o.value.includes('stables')); assert.ok(option); r = ok(s.resolveChoice(actor, option.value)) }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable', JSON.stringify(r.interaction)); return r
}
export function build(s: GameSession, count: number, actor = 0) {
  const r = stableSelect(s, actor); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
  const tiles = r.interaction.request.farm.selectableTiles.slice(0, count); assert.equal(tiles.length, count)
  const built = ok(s.commitSelectionChoice(actor, { stables: tiles })); assert.equal(built.state.players[actor]!.stableTiles.length, count); assert.equal(built.state.players[actor]!.resources.wood, 0); return built
}
export function room(s: GameSession) {
  let r = turn(s, 0, 'farm-expansion')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const option = choices(r).find(o => o.value.includes('construct')); assert.ok(option); r = ok(s.resolveChoice(0, option.value)) }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room', JSON.stringify(r.interaction)); return r
}
export function settleAnimals(s: GameSession, r: SessionResponse, actor = 0, count = 1, discard = false) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
    const zones = discard ? [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 }, { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }] : [{ id: actor === 0 ? 'pasture-1' : 'house:2-0', zoneType: actor === 0 ? 'pasture' : 'house', animalType: 'sheep', animalCount: count }]
    r = ok(s.resolveChoice(actor, 'confirm', { zones }))
  }
  assert.equal(r.state.players[actor]!.resources.sheep, discard ? 0 : count); return r
}
export function market(s: GameSession, actor = 0, count = 1, discard = false) { return settleAnimals(s, turn(s, actor, 'sheep-market'), actor, count, discard) }
export function nextRound(s: GameSession) {
  turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); const end = turn(s, 1, 'clay-pit')
  const r = confirmNext(s, end); assert.equal(r.state.round, 6); assert.equal(r.state.roundPhase, 'work'); return r
}
export function hutReward(r: SessionResponse, gain: { wood?: number; food?: number }) {
  const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === HUT && e.reason === 'cardEffect'); assert.equal(events.length, 1)
  const event = events[0]!; assert.ok(event.type === 'resource.moved'); assert.deepEqual(event.resources, gain); assert.deepEqual(event.to, { kind: 'player', playerId: r.state.players[0]!.id })
}

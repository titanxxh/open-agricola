// Helpers of ae-negative-03-stables-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const A089 = 'A089_StablePlanner'
export const D102 = 'D102_SampleStableMaker'
export const B027 = 'B027_Toolbox'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup({ card = A089, round = 1, stableCount = 0, toolbox = false, resources = {} }: { card?: string; round?: number; stableCount?: number; toolbox?: boolean; resources?: Partial<PlayerState['resources']> } = {}) {
  const s = createWorkSession({ seed: 42, configure: state => {
    state.round = round
    state.players.forEach(p => { p.resources.food = 40 })
    const p = state.players[0]!
    p.occupationHand = card === A089 ? [A089] : ['__test_placeholder__']
    p.occupationPlayed = card === D102 ? [D102] : []
    p.minorPlayed = toolbox || card === B027 ? [B027] : []
    if (card === D102) { p.minorHand = ['D076_SocialBenefits']; p.resources.reed = 1 }
    Object.assign(p.resources, resources)
    p.stableTiles = Array.from({ length: stableCount }, (_, col) => ({ row: 0, col: col + 1 }))
  } })
  sessions.push(s)
  return s
}
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
  const option = r.interaction.request.options.find(predicate)
  assert.ok(option, JSON.stringify(r.interaction))
  return ok(s.resolveChoice(r.interaction.playerIndex, option.value))
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
  assert.equal(r.state.currentPlayerIndex, actor)
  return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function playPlanner(s: GameSession) {
  const r = ok(s.takeAction(0, 'lessons'))
  assert.ok(r.state.players[0]!.occupationPlayed.includes(A089))
  return r
}
export function schedule(s: GameSession, r: SessionResponse, count: number) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  const options = r.interaction.request.options.filter(o => o.value !== '__skip__')
  const option = options[count - 1]
  assert.ok(option)
  return ok(s.resolveChoice(0, option.value))
}
export function futureRounds(r: SessionResponse) {
  return r.state.futureMeeples.filter(m => m.cardId === A089 && m.resources.stable === 1).map(m => m.round).sort((a, b) => a - b)
}
export function reachDue(s: GameSession) {
  schedule(s, playPlanner(s), 1)
  turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); const first = turn(s, 1, 'clay-pit')
  let r = confirmNext(s, first)
  assert.equal(r.state.round, 2)
  for (const round of [2, 3]) {
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
    assert.deepEqual(futureRounds(r), [4])
    turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer')
    r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, round + 1)
  }
  assert.equal(r.state.players[0]!.resources.wood, 0)
  r = choose(s, r, o => o.sourceCard === A089 || o.value === A089)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
  return r
}
export function returnWindow(s: GameSession) {
  turn(s, 0, 'reed-bank'); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds')
  const r = confirmNext(s, turn(s, 1, 'clay-pit'))
  assert.equal(r.state.round, 5)
  assert.equal(r.state.players[0]!.resources.wood, 0)
  assert.equal(r.state.players[0]!.resources.grain, 1)
  assert.equal(r.state.players[0]!.resources.food, 40)
  return r
}
export function returnSelection(s: GameSession) {
  let r = returnWindow(s)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === D102)
  r = choose(s, r, o => o.value !== '__skip__')
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection', JSON.stringify(r.interaction))
  return r
}
export function makerGoods(r: SessionResponse) { const p = r.state.players[0]!; return { stables: p.stableTiles.length, wood: p.resources.wood, grain: p.resources.grain, food: p.resources.food } }
export function buildFarm(s: GameSession, mode: 'room' | 'stable', r = ok(s.takeAction(0, 'farm-expansion'))) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.labelKey === (mode === 'room' ? 'actions.construct.name' : 'actions.stables.name'))
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
  const farm = r.interaction.request.farm
  assert.ok(farm.farmType === 'room' || farm.farmType === 'stable')
  assert.equal(farm.farmType, mode)
  const tile = farm.selectableTiles[0]!
  return ok(s.commitSelectionChoice(0, mode === 'room' ? { rooms: [tile] } : { stables: [tile] }))
}
export function finishExpansion(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.promptKey !== 'ui.interactionToolboxImprovement') {
    r = choose(s, r, o => o.value === '__done__' || o.value === '__skip__')
  }
  return r
}
export function toolboxMajors(s: GameSession, r: SessionResponse) {
  r = finishExpansion(s, r)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === B027)
  assert.equal(r.interaction.promptKey, 'ui.interactionToolboxImprovement')
  r = choose(s, r, o => o.value !== '__skip__')
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  assert.deepEqual(r.interaction.request.options.map(o => o.value).sort(), ['Major_Basket', 'Major_Joinery', 'Major_Pottery'])
  return r
}

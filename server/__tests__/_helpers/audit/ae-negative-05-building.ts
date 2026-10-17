// Helpers of ae-negative-05-building-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const A013 = 'A013_RenovationCompany'
export const A014 = 'A014_CarpentersHammer'
export const A015 = 'A015_CarpentersAxe'
export const sessions: GameSession[] = []
export const pair = [{ row: 1, col: 1 }, { row: 2, col: 1 }]
export function setup({ card = A013, played = false, house = 'wood', rooms = 2, stableCount = 0, resources = {}, opponent = {} }: { card?: string; played?: boolean; house?: PlayerState['houseType']; rooms?: number; stableCount?: number; resources?: Partial<PlayerState['resources']>; opponent?: Partial<PlayerState['resources']> } = {}) {
  const s = createWorkSession({ seed: 514, configure: state => {
    state.round = 14
    state.players.forEach(p => {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []; p.cardStates = {}
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card]
    p.minorPlayed = played ? [card] : []
    p.houseType = house
    p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...pair.slice(0, rooms - 2)]
    p.rooms = rooms
    p.stableTiles = Array.from({ length: stableCount }, (_, col) => ({ row: 0, col: col + 1 }))
    Object.assign(p.resources, resources)
    Object.assign(state.players[1]!.resources, opponent)
    const forest = state.actionSpaces.find(a => a.id === 'forest')!
    forest.resources.wood = 3
  } })
  sessions.push(s)
  assert.equal(s.getState().state.players[0]!.rooms, rooms)
  return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : [] }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  const o = opts(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction))
  return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor)
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function minor(s: GameSession, card: string) {
  let r = turn(s, 0, 'meeting-place')
  if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-') && !o.value.includes('skip'))) r = choose(s, r, o => o.value.startsWith('action-improvement-') && !o.value.includes('skip'))
  return r
}
export function buy(s: GameSession, card: string) { const r = minor(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card) }
export function deniedCard(s: GameSession, card: string) {
  const r = minor(s, card)
  assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false)
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  assert.ok(s.getState().state.players[0]!.minorHand.includes(card))
}
export function acceptReno(s: GameSession, r: SessionResponse) {
  r = choose(s, r, o => o.value !== '__skip__')
  if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget') r = ok(s.resolveChoice(0, 'clay'))
  return r
}
export function farm(s: GameSession, actor = 0, kind: 'room' | 'stable' = 'room') {
  let r = turn(s, actor, 'farm-expansion')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.labelKey === (kind === 'room' ? 'actions.construct.name' : 'actions.stables.name'))
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
  assert.equal(r.interaction.request.farm.farmType, kind)
  return r
}
export function build(s: GameSession, rooms = pair, actor = 0) { farm(s, actor); return ok(s.commitSelectionChoice(actor, { rooms })) }
export function facts(r: SessionResponse, actor = 0) { const p = r.state.players[actor]!; return { rooms: p.rooms, house: p.houseType, wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone, stables: p.stableTiles.length } }
export function axe(s: GameSession) { const r = turn(s, 0, 'forest'); return choose(s, r, o => o.value !== '__skip__') }
export function finish(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && opts(r).some(o => o.value === '__skip__')) return ok(s.resolveChoice(r.interaction.playerIndex, '__skip__'))
  return r
}

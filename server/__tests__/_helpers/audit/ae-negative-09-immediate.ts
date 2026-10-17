// Helpers of ae-negative-09-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState, Resource } from '../../../../shared/contract/types'
import { setActiveWorkerCount } from '../../../../shared/domain/player'
import { buildLogPresentationPlan } from '../../../../shared/events/log-mapper'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const BASE = 'A004_Baseboards', CLAY = 'A005_ClayEmbankment', KNIFE = 'A007_GardenersKnife'
export const ROTATION = 'E070_CropRotationField', WAGE = 'B007_Wage', COMPANION = 'A016_RammedClay'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, resources: Partial<Resource> = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
    state.round = 5; state.availableMajorImprovements = []
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []
      Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
      assert.equal(p.workers.length, 5); assert.equal(p.workers.filter(w => w.isActive).length, 2)
    }
    const p = state.players[0]!; p.minorHand = [card, WAGE, COMPANION]; Object.assign(p.resources, resources)
    configure(state)
  } }); sessions.push(s); return s
}
export function options(r: SessionResponse) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function menu(s: GameSession) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  const action = options(r).find(o => o.value.startsWith('action-improvement-'))
  if (action) r = ok(s.resolveChoice(0, action.value))
  return r
}
export function buy(s: GameSession, card: string) {
  const r = menu(s); assert.ok(options(r).some(o => o.value === card && !o.disabled))
  return ok(s.resolveChoice(0, card))
}
export function passed(r: SessionResponse, card: string) {
  assert.equal(r.state.players[0]!.minorHand.includes(card), false)
  assert.equal(r.state.players[0]!.minorPlayed.includes(card), false)
  assert.equal(r.state.players[1]!.minorHand.filter(id => id === card).length, 1)
  assert.equal(r.state.players[1]!.minorPlayed.includes(card), false)
  const events = r.state.events.filter(e => 'fromPlayerId' in e && 'toPlayerId' in e && 'cardId' in e && e.cardId === card)
  assert.equal(events.length, 1)
  const event = events[0]; assert.ok(event && 'fromPlayerId' in event && 'toPlayerId' in event && 'cardId' in event)
  assert.equal(event.cardId, card); assert.equal(event.fromPlayerId, r.state.players[0]!.id); assert.equal(event.toPlayerId, r.state.players[1]!.id)
  const rows = buildLogPresentationPlan(r.state.events, { playerNames: {} }).rows.filter(row => row.logEntry.key === 'log.cardPassed' && row.logEntry.params?.cardId === card)
  assert.equal(rows.length, 1)
  const row = rows[0]; assert.ok(row)
  assert.deepEqual(row.sourceEventRef, { id: event.id, seq: event.seq, type: event.type })
  assert.equal(row.logEntry.playerRefs?.fromPlayer, event.fromPlayerId); assert.equal(row.logEntry.playerRefs?.toPlayer, event.toPlayerId)
}
export function deny(s: GameSession, card: string) {
  const r = menu(s); assert.equal(options(r).some(o => o.value === card && !o.disabled), false)
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  const beforeFood = r.state.players[0]!.resources.food
  const retry = ok(s.resolveChoice(0, WAGE)); assert.equal(retry.state.players[0]!.resources.food, beforeFood + 2)
  assert.equal(retry.state.players[0]!.minorHand.includes(card), true)
}
export function rooms(p: PlayerState, count: number, family = 2) {
  p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...[{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count - 2)]
  p.rooms = count; setActiveWorkerCount(p, family)
  assert.equal(p.workers.length, 5); assert.equal(p.workers.filter(w => w.isActive).length, family)
}
export function fields(p: PlayerState, crops: Array<['grain' | 'vegetable' | null, number]>) {
  const places = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 1 }]
  p.fields = crops.map(([kind, remaining], i) => { const tile = places[i]; assert.ok(tile); return { ...tile, stacks: kind ? [{ kind, remaining }] : [] } })
}
export function goods(r: SessionResponse, actor = 0) {
  const p = r.state.players[actor]!; return { food: p.resources.food, wood: p.resources.wood, clay: p.resources.clay, grain: p.resources.grain }
}
export function turn(s: GameSession, actor: number, action: string) {
  let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle'); assert.equal(r.state.currentPlayerIndex, actor)
  return ok(s.takeAction(actor, action))
}

// Helpers of ae-negative-08-triggers-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync } from '../audit-evidence-fs'
import { it } from 'vitest'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import '../../../../shared/cards/A/A051_DriftNetBoat'
import '../../../../shared/cards/A/A052_ThrowingAxe'
import '../../../../shared/cards/A/A053_Claypipe'
import '../../../../shared/cards/A/A006_StorageBarn'

export const BOAT = 'A051_DriftNetBoat', AXE = 'A052_ThrowingAxe', PIPE = 'A053_Claypipe'
export const sessions: GameSession[] = []
export function scenario(name: string, run: () => object) {
  it(name, () => {
    const actual = run()
    mkdirSync('output/ae-negative', { recursive: true })
    appendFileSync(`output/ae-negative/08-oa-facts-${process.env.AGRICOLA_NEGATIVE_RAW === '1' ? 'raw' : 'normal'}.jsonl`, JSON.stringify({ name, actual }) + '\n')
  })
}
export function setup(card: string, { played = true, round = 5, resources = {}, forest = 3, fishing = 2, pigs = 1, configure = () => {} }: { played?: boolean; round?: number; resources?: Partial<PlayerState['resources']>; forest?: number; fishing?: number; pigs?: number; configure?: (state: GameState) => void } = {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    state.players.forEach(p => {
      p.minorHand = ['B007_Wage', 'A054_Credit']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[0]!
    if (played) p.minorPlayed = [card]; else p.minorHand.push(card)
    Object.assign(p.resources, resources)
    stock(state, 'forest', 'wood', forest); stock(state, 'fishing', 'food', fishing); stock(state, 'pig-market', 'boar', pigs)
    configure(state)
  } })
  sessions.push(s)
  assert.equal(s.getState().state.roundPhase, 'work'); assert.equal(s.getState().interaction.stateId, 'idle')
  return s
}
export function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'boar' | 'clay', count: number) {
  const action = state.actionSpaces.find(a => a.id === space); assert.ok(action); action.resources[resource] = count
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const r = ok(s.takeAction(actor, space)); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id), true); return r }
export function choices(r: SessionResponse) { ok(r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function enter(s: GameSession) {
  let r = turn(s, 0, 'meeting-place'); const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
  if (branch) r = ok(s.resolveChoice(0, branch.value)); return r
}
export function offered(r: SessionResponse, card: string) { return choices(r).some(o => o.value === card && !o.disabled) }
export function buy(s: GameSession, r: SessionResponse, card: string) {
  assert.equal(offered(r, card), true); const result = ok(s.resolveChoice(0, card))
  assert.equal(result.state.players[0]!.minorPlayed.includes(card), card !== 'A006_StorageBarn'); assert.equal(result.state.players[0]!.minorHand.includes(card), false)
  if (card === 'A006_StorageBarn') { assert.equal(result.state.players[1]!.minorHand.includes(card), true); const gains = result.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card); assert.equal(gains.length, 1); const gain = gains[0]!; assert.ok(gain.type === 'resource.moved'); assert.deepEqual(gain.resources, { wood: 1 }); return result }
  const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card); assert.equal(events.length, 1)
  const event = events[0]!; assert.ok(event.type === 'card.played'); assert.equal(event.actorPlayerId, result.state.players[0]!.id)
  assert.deepEqual(event.payment?.resources ?? {}, card === BOAT ? { wood: 1, reed: 1 } : card === AXE ? { wood: 1 } : card === PIPE ? { clay: 1 } : {})
  return result
}
export function values(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources }
export function bonus(r: SessionResponse, card: string, amount: number) {
  const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card && e.reason === 'cardEffect')
  assert.equal(events.length, amount === 0 ? 0 : 1)
  if (amount) { const e = events[0]!; assert.ok(e.type === 'resource.moved'); assert.deepEqual(e.resources, { food: amount }); assert.deepEqual(e.to, { kind: 'player', playerId: r.state.players[0]!.id }) }
}
export function retryFree(s: GameSession, card: string) { const r = enter(s); assert.equal(offered(r, card), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); return buy(s, r, 'A054_Credit') }
export function barn(s: GameSession) { return buy(s, enter(s), 'A006_StorageBarn') }
export function addBarn(state: GameState) { state.players[0]!.minorHand.push('A006_StorageBarn'); state.players[0]!.improvements = ['Major_Joinery'] }
export function endAfterFirst(s: GameSession, ownerSpace = 'grain-seeds') { turn(s, 1, 'fishing'); turn(s, 0, ownerSpace); const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 6); assert.equal(r.state.roundPhase, 'work'); assert.equal(r.interaction.stateId, 'idle'); return r }
export function endAfterSecond(s: GameSession) { const r = confirmNext(s, turn(s, 1, 'reed-bank')); assert.equal(r.state.round, 6); assert.equal(r.state.roundPhase, 'work'); return r }
export function assertReset(r: SessionResponse) { assert.equal(r.state.players[0]!.cardStates[PIPE]?.infobox, '0 / 7') }

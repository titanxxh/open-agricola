// Helpers of ae-negative-02-reservations-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { createPlayerActionSpaces } from '../../../../shared/cards/player-action-space'

export const D = 'D051_Archway', E = 'E010_StrawHat', L = 'E148_Lazybones'
// Design: native Sessions, literal rule outcomes, real turn rotation. See batch result JSON.
export function setup(card: string, round = 3, configure: (state: GameState) => void = () => {}, played = true) {
  return createWorkSession({ seed: 8251, options: { playerCount: card === L ? 4 : 2 }, configure: state => {
    state.round = round
    state.availableMajorImprovements = []
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.resources = { ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 }
    }
    const owner = state.players[0]!
    if (played) (card === L ? owner.occupationPlayed : owner.minorPlayed).push(card)
    else (card === L ? owner.occupationHand : owner.minorHand).splice(0, 1, card)
    configure(state)
    if (card === D && played) state.actionSpaces.push(...createPlayerActionSpaces(state))
  } })
}
export function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }
export function option(r: SessionResponse, predicate: (value: { value: string; labelKey?: string }) => boolean) {
  const i = wait(r); assert.ok(i.request.kind === 'choice'); const o = i.request.options?.find(predicate); assert.ok(o, JSON.stringify(i)); return o.value
}
export function finish(s: GameSession, initial: SessionResponse) {
  let r = initial
  for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
    const kind = r.interaction.request.kind
    if (kind === 'confirm-next-player') r = confirmNext(s, r)
    else if (kind === 'choice' && r.interaction.request.options?.some(o => o.value === '__skip__')) r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
    else break
    assert.equal(r.ok, true, r.error)
  }
  return r
}
export function place(s: GameSession, actor: number, id: string) {
  let r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error)
  if (id === 'farmland') { wait(r); r = s.commitSelectionChoice(actor, { tile: { row: 0, col: 2 } }); assert.equal(r.ok, true, r.error) }
  return r
}
export function endWork(s: GameSession, first = 'grain-seeds', second = 'reed-bank') {
  finish(s, place(s, 0, first)); finish(s, place(s, 1, second))
  finish(s, place(s, 0, 'clay-pit')); const r = place(s, 1, 'forest')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') return confirmNext(s, r)
  if (r.interaction.stateId === 'idle' && r.state.roundPhase === 'work') return s.performRoundEnd()
  return r
}
export function buyMinor(s: GameSession, card: string) {
  let r = s.takeAction(0, 'meeting-place'); assert.equal(r.ok, true, r.error)
  for (let n = 0; n < 4 && !r.state.players[0]!.minorPlayed.includes(card); n++) {
    if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'choice') break
    const op = r.interaction.request.options?.find(o => o.value === card) ?? r.interaction.request.options?.find(o => o.value.startsWith('action-improvement-'))
    if (!op) break
    r = s.resolveChoice(0, op.value); assert.equal(r.ok, true, r.error)
  }
  return r
}

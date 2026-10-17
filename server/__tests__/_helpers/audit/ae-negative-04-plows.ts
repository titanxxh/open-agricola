// Helpers of ae-negative-04-plows-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const WHEEL = 'A018_WheelPlow'
export const DOUBLE = 'A020_DoubleTurnPlow'
export const MOLD = 'B019_MoldboardPlow'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup({ card = WHEEL, round = 1, played = true, occupations = 2, resources = {}, lastPlot = false, existingField = false }: { card?: string; round?: number; played?: boolean; occupations?: number; resources?: Partial<PlayerState['resources']>; lastPlot?: boolean; existingField?: boolean } = {}) {
  const s = createWorkSession({ seed: 42, configure: state => {
    state.round = round
    for (const p of state.players) p.resources.food = 40
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card]
    p.minorPlayed = played ? [card] : []
    p.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations)
    if (played && card === MOLD) p.cardStates[card] = { stack: ['field', 'field'] }
    Object.assign(p.resources, resources)
    if (existingField) p.fields = [{ row: 0, col: 1, stacks: [] }]
    if (lastPlot) {
      p.fields = []
      for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        if (p.roomTiles.some(t => t.row === row && t.col === col) || (row === 0 && col === 4)) continue
        p.fields.push({ row, col, stacks: [] })
      }
      assert.equal(p.fields.length, 12)
    }
  } })
  sessions.push(s)
  assert.equal(s.getState().interaction.stateId, 'idle')
  return s
}
export function choice(s: GameSession, r: SessionResponse, pred: (o: { value: string; labelKey?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
  const o = r.interaction.request.options.find(pred)
  assert.ok(o, JSON.stringify(r.interaction))
  return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
  assert.equal(r.state.currentPlayerIndex, actor)
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function play(s: GameSession, card: string) {
  let r = turn(s, 0, 'meeting-place')
  for (let n = 0; n < 6 && r.state.players[0]!.minorHand.includes(card) && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) {
    const o = r.interaction.request.options.find(o => o.value === card || o.value.startsWith('action-improvement-'))
    if (!o) break
    r = ok(s.resolveChoice(0, o.value))
  }
  return r
}
export function farm(s: GameSession, r: SessionResponse) {
  for (let n = 0; n < 6 && r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'); n++) r = choice(s, r, o => o.value !== '__skip__' && o.value !== '__pass__')
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
  assert.ok(r.interaction.request.farm.farmType === 'plow')
  return r
}
export function plow(s: GameSession, r: SessionResponse, tile?: FarmTilePosition) {
  r = farm(s, r)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
  const target = tile ?? r.interaction.request.farm.selectableTiles[0]!
  return ok(s.commitSelectionChoice(r.interaction.playerIndex, { tile: target }))
}
export function skip(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choice(s, r, o => o.value !== '__pass__')
  return choice(s, r, o => o.value === '__skip__')
}
export function fields(r: SessionResponse) { return r.state.players[0]!.fields.length }
export function stack(r: SessionResponse) { return r.state.players[0]!.cardStates[MOLD]?.stack?.length ?? 0 }
export function finished(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)) }
export function endRound(s: GameSession, ownerSpace = 'day-laborer') {
  turn(s, 1, 'forest'); turn(s, 0, ownerSpace)
  const r = confirmNext(s, turn(s, 1, 'clay-pit'))
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
  return r
}
export function invalidBonus(s: GameSession) {
  assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
  assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
  assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 2, col: 4 } }))
}
export function blockedPurchase(card: string, options: { occupations?: number; resources?: Partial<PlayerState['resources']>; round?: number }) {
  const s = setup({ card, played: false, ...options })
  const before = { ...s.state.players[0]!.resources }
  const r = play(s, card)
  assert.ok(r.state.players[0]!.minorHand.includes(card))
  assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
  assert.deepEqual(r.state.players[0]!.resources, before)
  assert.equal(fields(r), 0)
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  return r
}

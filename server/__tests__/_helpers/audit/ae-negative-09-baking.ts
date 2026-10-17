// Helpers of ae-negative-09-baking-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync } from '../audit-evidence-fs'
import { it } from 'vitest'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { takeMajorImprovementFromSupply } from '../../../../shared/cards/major/supply'
import { readCardResourceStats } from '../../../../shared/cards/helpers/card-state'
import '../../../../shared/cards/A/A060_OrientalFireplace'
import '../../../../shared/cards/A/A061_WinnowingFan'
import '../../../../shared/cards/A/A063_DutchWindmill'

export const ORIENTAL = 'A060_OrientalFireplace', FAN = 'A061_WinnowingFan', MILL = 'A063_DutchWindmill', FIRE = 'Major_Fireplace1'
export const OUT = process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR ?? 'output/ae-negative'
export const sessions: GameSession[] = []
export function scenario(name: string, run: () => object) { it(name, () => { const actual = run(); mkdirSync(OUT, { recursive: true }); appendFileSync(`${OUT}/09-oa-facts-${process.env.AGRICOLA_NEGATIVE_RAW === '1' ? 'raw' : 'normal'}.jsonl`, JSON.stringify({ name, actual }) + '\n') }) }
export function setup(card: string, { played = true, round = 5, resources = {}, majors = [], minor = [], field = false, crop = 0, animal = null, configure = () => {} }: { played?: boolean; round?: number; resources?: Partial<PlayerState['resources']>; majors?: string[]; minor?: string[]; field?: boolean; crop?: number; animal?: 'sheep' | 'boar' | 'cattle' | null; configure?: (state: GameState) => void } = {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    state.players.forEach(p => { p.minorHand = ['B007_Wage', 'A054_Credit']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 }) })
    const p = state.players[0]!
    p.minorPlayed = played ? [card, ...minor] : minor; if (!played) p.minorHand.push(card)
    p.improvements = majors; majors.forEach(id => takeMajorImprovementFromSupply(state, id)); Object.assign(p.resources, resources)
    if (field) p.fields = [{ row: 0, col: 1, stacks: crop ? [{ kind: 'grain', remaining: crop }] : [] }]
    if (animal) { p.houseAnimals = { '2-0': animal }; p.resources[animal] = 1 }
    configure(state)
  } }); sessions.push(s); assert.equal(s.getState().interaction.stateId, 'idle'); assert.equal(s.getState().state.roundPhase, 'work'); return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function values(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources }
export function opts(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const r = ok(s.takeAction(actor, space)); assert.ok(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id)); return r }
export function enter(s: GameSession) { let r = turn(s, 0, 'meeting-place'); const branch = opts(r).find(o => o.value.startsWith('action-improvement-')); if (branch) r = ok(s.resolveChoice(0, branch.value)); return r }
export function bought(s: GameSession, r: SessionResponse, card: string, returnId?: string) {
  assert.ok(opts(r).some(o => o.value === card && !o.disabled)); r = ok(s.resolveChoice(0, card))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.promptKey === 'prompt.selectPayment') { const option = opts(r).find(o => returnId ? JSON.stringify(o).includes(returnId) : o.value !== 'cancel'); assert.ok(option, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(0, option.value)) }
  assert.equal(r.state.players[0]!.minorPlayed.includes(card), true); assert.equal(r.state.players[0]!.minorHand.includes(card), false)
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
  const e = r.state.events.find(e => e.type === 'card.played' && e.cardId === card); assert.ok(e?.type === 'card.played')
  if (card === FAN) assert.deepEqual(e.payment?.resources, { reed: 1 }); if (card === MILL) assert.deepEqual(e.payment?.resources, { wood: 2, stone: 2 })
  return r
}
export function buy(s: GameSession, card: string, returnId?: string) { return bought(s, enter(s), card, returnId) }
export function deny(s: GameSession, card: string) { const r = enter(s); assert.equal(opts(r).some(o => o.value === card && !o.disabled), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); const retry = bought(s, r, 'A054_Credit'); assert.equal(retry.state.players[0]!.minorHand.includes(card), true); return retry }
export function cardFood(r: SessionResponse, card: string, actor = 0) { return readCardResourceStats(r.state.players[actor]!, card)?.gained.food ?? 0 }
export function bake(s: GameSession, count = 1, actor = 0, provider = FIRE) {
  const remaining = s.getState().state.players[actor]!.resources.grain - count
  let r = turn(s, actor, 'grain-utilization')
  for (let n = 0; n < 5 && values(r, actor).grain > remaining; n++) {
    const option = opts(r).find(o => o.value === `count-${provider}-${count}`) ?? opts(r).find(o => o.value === provider || o.sourceCard === provider) ?? opts(r).find(o => o.value === 'bake-bread' || o.labelKey === 'actions.bakeBread.name')
    assert.ok(option, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(actor, option.value))
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); return r
}
export function cook(s: GameSession, from: 'vegetable' | 'sheep' | 'cattle') {
  const r = ok(s.takeAnytimeAction(0, 'exchange')); const options = opts(r); assert.ok(options.length)
  const index = from === 'vegetable' ? 0 : from === 'sheep' ? 1 : 2
  const result = ok(s.resolveChoice(0, `bulk:${index}=1`)); assert.equal(values(result)[from], 0); return result
}
export function workEnd(s: GameSession) { turn(s, 0, 'forest'); turn(s, 1, 'grain-seeds'); turn(s, 0, 'clay-pit'); return confirmNext(s, turn(s, 1, 'reed-bank')) }
export function fanChoice(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.sourceCard === FAN }
export function finishHarvest(s: GameSession, r: SessionResponse, accept = false) {
  let paid = 0
  for (let n = 0; n < 15 && r.interaction.stateId === 'wait'; n++) {
    const i = r.interaction
    if (fanChoice(r)) { const choice = opts(r).find(o => accept ? o.value !== '__skip__' : o.value === '__skip__'); assert.ok(choice); r = ok(s.resolveChoice(i.playerIndex, choice.value)); continue }
    if (i.request.kind === 'feed') { const food = values(r, i.playerIndex).food; r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] })); assert.equal(values(r, i.playerIndex).food, food - 4); paid++; continue }
    if (i.request.kind === 'confirm-player-switch') { r = ok(s.resolveChoice(i.request.toPlayerIndex, 'confirm')); continue }
    assert.fail(JSON.stringify(i))
  }
  assert.equal(r.interaction.stateId, r.state.gameOver ? 'gameover' : 'idle'); assert.ok(r.state.roundPhase === 'work' || r.state.gameOver); assert.ok(paid <= 2); return r
}
export function fanHarvest({ grain = 1, crop = 0, played = true, round = 4, mill = false }: { grain?: number; crop?: number; played?: boolean; round?: number; mill?: boolean } = {}) { const s = setup(FAN, { played, round, resources: { grain }, majors: [FIRE], minor: mill ? [MILL] : [], field: crop > 0, crop }); const r = workEnd(s); return { s, r } }
export function point(r: SessionResponse, card: string, expected: number) { assert.ok(r.scores); assert.equal(r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === card)?.score, expected) }

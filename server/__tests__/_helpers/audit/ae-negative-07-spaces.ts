// Helpers of ae-negative-07-spaces-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from '../negative-rule-audit'

export const A039 = 'A039_Chapel', A040 = 'A040_PottersYard', A041 = 'A041_VegetableSlicer'
export const ORIENTAL = 'A060_OrientalFireplace'
export const tile = { row: 1, col: 1 }, pair = [tile, { row: 2, col: 1 }]
export const edges = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']
export const fieldTiles = [0, 1, 2, 3, 4].map(col => ({ row: 0, col })).concat({ row: 1, col: 4 })
export const occupations = ['A125_Priest', 'A124_Knapper']
export const sessions: GameSession[] = []
export function setup({ card = A039, played = true, resources = {}, opponent = {}, occ = occupations, fields = 0, used = 'none', fireplace = '', opponentFireplace = '', hearth = 'Major_CookingHearth1' }: { card?: string; played?: boolean; resources?: Partial<PlayerState['resources']>; opponent?: Partial<PlayerState['resources']>; occ?: string[]; fields?: number; used?: 'none' | 'stable' | 'pasture'; fireplace?: string; opponentFireplace?: string; hearth?: string } = {}) {
  const s = createWorkSession({ seed: 724, configure: state => {
    state.round = 14
    state.availableMajorImprovements = card === A041 ? [hearth] : []
    state.players.forEach(p => {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}
      p.rooms = 2; p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
      p.fields = []; p.stableTiles = []; p.pastures = []; p.fenceSegments = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[0]!
    p.minorPlayed = played ? [card] : []; p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
    p.occupationPlayed = card === A039 ? occ : []
    p.fields = fieldTiles.slice(0, fields).map(t => ({ ...t, stacks: [] }))
    if (used === 'stable') p.stableTiles = [tile]
    if (used === 'pasture') { p.pastures = [{ id: 'existing', tiles: [tile], animalType: null, animalCount: 0 }]; p.fenceSegments = edges.map(edge => ({ edge, type: 'fence' })) }
    if (fireplace.startsWith('Major_')) p.improvements = [fireplace]
    else if (fireplace) p.minorPlayed.push(fireplace)
    if (opponentFireplace) state.players[1]!.improvements = [opponentFireplace]
    Object.assign(p.resources, resources); Object.assign(state.players[1]!.resources, opponent)
    state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3
  } })
  sessions.push(s); return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : [] }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); const o = opts(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
}
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function minor(s: GameSession, card: string) { let r = turn(s, 0, 'meeting-place'); if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { const r = minor(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card) }
export function denied(s: GameSession, card: string) { const r = minor(s, card); assert.equal(opts(r).some(o => o.value === card && !o.disabled), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.ok(s.getState().state.players[0]!.minorHand.includes(card)) }
export function bonus(r: SessionResponse, actor = 0) { assert.ok(r.scores); return r.scores[actor]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === A039)?.score ?? 0 }
export function chapelUndo(before: string, after: SessionResponse) {
  assert.equal(after.ok, true, after.error)
  const normalize = (snapshot: string) => JSON.parse(snapshot, (key, value: unknown) => key === 'blockedBy' && Array.isArray(value) && value.length === 0 ? undefined : value)
  assert.deepEqual(normalize(undoRuleSnapshot(after)), normalize(before))
  const packet = after.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction')
}
export function purchasedCardUndo(before: string, after: SessionResponse) {
  assert.equal(after.ok, true, after.error)
  const normalize = (snapshot: string) => JSON.parse(snapshot, (key, value: unknown) => key === 'playedCards' ? undefined : value)
  assert.deepEqual(normalize(undoRuleSnapshot(after)), normalize(before))
  const packet = after.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction')
}
export function occupants(r: SessionResponse) { return r.state.actionSpaces.find(a => a.id === A039)!.takenBy.length }
export function remaining(r: SessionResponse) { return (r.state.players[0]!.farmyardSpaceStates ?? []).filter(token => token.sourceCardId === A040 && token.kind === 'farmyard-goods-token').reduce((sum, token) => sum + (token.resources?.clay ?? 0), 0) }
export function potter(config: Parameters<typeof setup>[0] = {}) { return setup({ card: A040, played: false, fields: 6, resources: { wood: 1, reed: 1 }, ...config }) }
export function boughtPotter(s: GameSession, opponentPlow = false) { const r = buy(s, A040); assert.equal(remaining(r), 7); if (opponentPlow) { turn(s, 1, 'farmland'); ok(s.commitSelectionChoice(1, { tile: { row: 0, col: 0 } })) } else turn(s, 1, 'forest'); return s }
export function farm(s: GameSession, type: 'construct' | 'stables') { let r = turn(s, 0, 'farm-expansion'); if (opts(r).length) r = choose(s, r, o => o.value.includes(type)); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction)); return r }
export function finish(s: GameSession, r: SessionResponse) { for (let n = 0; n < 3 && opts(r).some(o => o.value === '__skip__'); n++) r = ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, '__skip__')); return r }
export function exchange(s: GameSession, r: SessionResponse, partial = false) { const choices = opts(r).filter(o => o.value !== '__skip__'); assert.ok(choices.length, JSON.stringify(r.interaction)); const choice = partial ? choices.at(-1)! : choices[0]!; return finish(s, ok(s.resolveChoice(0, choice.value))) }
export function plow(s: GameSession) { return ok(s.commitSelectionChoice(0, { tile })) }
export function hearth(s: GameSession, actor = 0) { let r = turn(s, actor, 'major-improvement'); const id = r.state.availableMajorImprovements[0]; if (!r.state.players[actor]!.improvements.some(c => c.startsWith('Major_CookingHearth'))) { assert.ok(id); r = choose(s, r, o => o.value === id || o.value === `major:${id}`) } return r }
export function reward(r: SessionResponse, wood: number, vegetable: number, actor = 0) { assert.equal(r.state.players[actor]!.resources.wood, wood); assert.equal(r.state.players[actor]!.resources.vegetable, vegetable) }

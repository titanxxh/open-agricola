// Helpers of ae-negative-06-actions-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const A023 = 'A023_StoneCompany', A024 = 'A024_ThreshingBoard', A025 = 'A025_Bassinet'
export const TAP = 'E047_SyrupTap', PARLOR = 'B013_CarpentersParlor', FREE = 'A057_MilkingParlor'
export const sessions: GameSession[] = []
export function setup({ card = A023, played = true, owner = 0, players = 2, round = 14, rooms = 2, hand = [], occupations = [], cookery = false, opponentCookery = false, resources = {}, opponent = {}, opponentHand = [] }: { card?: string; played?: boolean; owner?: number; players?: number; round?: number; rooms?: number; hand?: string[]; occupations?: string[]; cookery?: boolean; opponentCookery?: boolean; resources?: Partial<PlayerState['resources']>; opponent?: Partial<PlayerState['resources']>; opponentHand?: string[] } = {}) {
  const s = createWorkSession({ seed: 624, options: { playerCount: players }, configure: state => {
    state.round = round
    state.availableMajorImprovements = []
    state.players.forEach(p => {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}
      p.rooms = rooms; p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...[{ row: 1, col: 1 }].slice(0, rooms - 2)]
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    })
    const p = state.players[owner]!
    p.minorPlayed = played ? [card] : []
    p.minorHand = [...(played ? [] : [card]), ...hand]; if (!p.minorHand.length) p.minorHand = ['__test_placeholder__']
    p.occupationPlayed = occupations
    p.improvements = cookery ? ['Major_Fireplace1'] : []
    Object.assign(p.resources, resources)
    Object.assign(state.players[1 - owner]!.resources, opponent)
    if (opponentCookery) state.players[1 - owner]!.improvements = ['Major_Fireplace2']
    if (opponentHand.length) state.players[1 - owner]!.minorHand = opponentHand
    for (const id of ['western-quarry', 'eastern-quarry']) state.actionSpaces.find(a => a.id === id)!.resources.stone = 1
    const forest = state.actionSpaces.find(a => a.id === 'forest')!; forest.resources.wood = 3
  } })
  sessions.push(s)
  return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : [] }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  const o = opts(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor)
  return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function minor(s: GameSession, card: string) {
  let r = turn(s, 0, 'meeting-place')
  if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-'))
  return r
}
export function buy(s: GameSession, card: string) { const r = minor(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card) }
export function denied(s: GameSession, card: string) { const r = minor(s, card); assert.equal(opts(r).some(o => o.value === card && !o.disabled), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.ok(r.state.players[0]!.minorHand.includes(card)) }
export function quarry(s: GameSession, id = 'western-quarry') { return turn(s, 0, id) }
export function improvement(s: GameSession, r: SessionResponse, card = TAP) {
  if (opts(r).some(o => o.value !== '__skip__') && !opts(r).some(o => o.value === card)) r = choose(s, r, o => o.value !== '__skip__')
  if (!r.state.players[0]!.minorPlayed.includes(card)) r = choose(s, r, o => o.value === card)
  return r
}
export function plow(s: GameSession, actor = 0) {
  const r = s.getState()
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow', JSON.stringify(r.interaction))
  const tile = r.interaction.request.farm.selectableTiles[0]; assert.ok(tile)
  return ok(s.commitSelectionChoice(actor, { tile }))
}
export function skipRemaining(s: GameSession, r: SessionResponse) { if (opts(r).some(o => o.value === '__skip__')) return ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, '__skip__')); return r }
export function bake(s: GameSession, r: SessionResponse) {
  r = choose(s, r, o => o.value !== '__skip__')
  if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBakeBreadChoice') r = ok(s.resolveChoice(0, 'Major_Fireplace1'))
  assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[0]!.resources.food, 42)
  return r
}
export function bakeSetup(config: Parameters<typeof setup>[0] = {}) { return setup({ card: A024, cookery: true, resources: { grain: 1 }, ...config }) }
export function bassinet(config: Parameters<typeof setup>[0] = {}) { return setup({ card: A025, owner: 1, round: 1, ...config }) }
export function people(r: SessionResponse, id: string) { return r.state.actionSpaces.find(a => a.id === id)!.takenBy.length }

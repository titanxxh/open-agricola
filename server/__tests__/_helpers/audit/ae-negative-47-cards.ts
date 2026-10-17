// Helpers of ae-negative-47-cards-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { markAllWorkersUsed } from '../../../../shared/domain/player'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/47/oa-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)) }
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 8) {
  const s = createWorkSession({ seed: 4247, options: { playerCount: 2 }, configure(state) {
    state.round = round
    for (const p of state.players) { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}; Object.assign(p.resources, { food: 100, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 }) }
    const p = state.players[0]!
    p.occupationPlayed = played ? [card] : []; p.occupationHand = played ? ['__test_placeholder__'] : [card]
    configure(state)
  } }); sessions.push(s); return s
}
export function finish(s: GameSession, response: SessionResponse, accept = true): SessionResponse {
  let r = ok(response)
  for (let n = 0; n < 64 && r.interaction.stateId === 'wait'; n++) {
    r = passPreparationExchanges(s, r)
    const i = r.interaction
    if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player') return ok(r)
    const q = i.request
        if (q.kind === 'confirm-player-switch') r = ok(s.resolveChoice(q.fromPlayerIndex, 'confirm'))
    else if (q.kind === 'select-trigger') { const o = (!accept ? q.options.find(o => o.value === '__pass__' && !('disabled' in o && o.disabled)) : undefined) ?? q.options.find(o => !('disabled' in o && o.disabled) && o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name'); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value)) }
    else if (q.kind === 'choice') { const o = (accept ? q.options.find(o => !o.disabled && !['__skip__', '__done__', '__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? q.options.find(o => !o.disabled && ['__skip__', '__done__', '__pass__'].includes(o.value)); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value)) }
    else if (q.kind === 'farm-select' && q.farm.farmType === 'plow' && !accept && q.options?.some(o => o.value === '__skip__')) r = ok(s.resolveChoice(i.playerIndex, '__skip__'))
    else if (q.kind === 'farm-select' && q.farm.farmType === 'plow') r = ok(s.commitSelectionChoice(i.playerIndex, { tile: q.farm.selectableTiles[0]! }))
    else if (q.kind === 'farm-select' && q.farm.farmType === 'stable') r = accept ? ok(s.commitSelectionChoice(i.playerIndex, { stables: [q.farm.selectableTiles[0]!] })) : ok(s.resolveChoice(i.playerIndex, '__skip__'))
    else if (q.kind === 'animal-reorg') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: q.zones }))
    else if (q.kind === 'feed') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
    else assert.fail(JSON.stringify(i))
  }
  return ok(r)
}
export function ready(s: GameSession) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); r = finish(s, r, false); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return r }
export function choose(s: GameSession, r: SessionResponse, value: string) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); const o = r.interaction.request.options?.find(o => o.value === value || o.labelKey === value); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)) }
export function lesson(s: GameSession, card: string) { ready(s); const p = ok(s.takeAction(s.state.currentPlayerIndex, 'lessons')); const r = p.state.players[0]!.occupationPlayed.includes(card) ? p : choose(s, p, card); assert.ok(r.state.players[0]!.occupationPlayed.includes(card)); return r }
export const ONE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export function fence(s: GameSession, edges = ONE, accept = true) { ready(s); const p = ok(s.takeAction(0, 'fencing')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); return finish(s, ok(s.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })), accept) }
export function anytime(s: GameSession, card: string) { const r = ok(s.getState()); const a = r.interaction.anytimeActions.find(a => JSON.stringify(a).includes(card)); assert.ok(a, JSON.stringify(r.interaction)); return ok(s.takeAnytimeAction(0, a.id)) }
export function end(s: GameSession) { for (const p of s.state.players) markAllWorkersUsed(s.state, p); s.loadState(s.state); return ok(s.performRoundEnd()) }
export function future(r: SessionResponse, card: string) { return r.state.futureMeeples.filter(e => e.playerId === r.state.players[0]!.id && e.cardId === card).map(e => ({ round: e.round, resources: e.resources })) }
export function reach(s: GameSession, target: number) { let r = ok(s.getState()); for (let n = 0; n < 100; n++) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); if (r.state.round === target) return ok(r); r = finish(s, r, false); if (r.state.round === target) return ok(r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); const actor = r.state.currentPlayerIndex, space = ['grain-seeds', 'day-laborer', 'clay-pit', 'reed-bank', 'forest', 'fishing'].find(id => s.getActionAvailability(actor)[id]); assert.ok(space); r = ok(s.takeAction(actor, space)) } assert.fail('Natural target round not reached') }
export function feedMenu(s: GameSession) { let r = end(s); for (let n = 0; n < 16; n++) { const i = r.interaction; if (i.stateId === 'wait' && i.request.kind === 'feed' && i.playerIndex === 0) return r; assert.ok(i.stateId === 'wait' && (i.request.kind === 'choice' || i.request.kind === 'select-trigger'), JSON.stringify(i)); const o = i.request.options.find(o => o.value === '__skip__' || o.value === '__pass__'); assert.ok(o, JSON.stringify(i)); r = ok(s.resolveChoice(i.playerIndex, o.value)) } assert.fail('Feed menu unreachable') }
export function harvestTrade(s: GameSession, card: string, count: number) { return s.resolveChoice(0, 'confirm', { selections: [{ sourceId: card, exchangeIndex: 0, count, sourceName: card }] }) }
export function fields(st: GameState, count: number, crop?: 'grain' | 'vegetable', owner = 0) { st.players[owner]!.fields = Array.from({ length: count }, (_, n) => ({ row: n < 5 ? 0 : 1, col: n < 5 ? n : n - 4, stacks: crop ? [{ kind: crop, remaining: 2 }] : [] })); }
export function sheepFarm(st: GameState, owner = 0) { const p = st.players[owner]!; p.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]; p.pastures = [{ id: 'sheep', tiles: [{ row: 0, col: 1 }], animalType: 'sheep', animalCount: 2 }]; p.stableTiles = [{ row: 0, col: 1 }]; p.fenceSegments = ONE.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); p.resources.sheep = 2 }
export function wolfFarm(st: GameState) { const p = st.players[0]!; p.pastures = [{ id: 'wolf-pigs', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]; p.stableTiles = [{ row: 0, col: 1 }]; p.fenceSegments = ONE.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); st.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 3 }
export function ownerTurn(s: GameSession) { ready(s); if (s.state.currentPlayerIndex === 1) { const space = ['day-laborer', 'reed-bank', 'clay-pit', 'grain-seeds'].find(id => s.getActionAvailability(1)[id]); assert.ok(space); finish(s, ok(s.takeAction(1, space)), false); ready(s) } assert.equal(s.state.currentPlayerIndex, 0) }
export function pioneerChoice(s: GameSession, r: SessionResponse, resource: 'wood' | 'clay' | 'reed' | 'stone') { for (let n = 0; n < 8; n++) { const i = r.interaction; assert.ok(i.stateId === 'wait' && (i.request.kind === 'choice' || i.request.kind === 'select-trigger')); if (i.request.kind === 'choice') { const o = i.request.options.find(o => o.effectPreview && 'resourcesGained' in o.effectPreview && o.effectPreview.resourcesGained?.[resource] === 1); if (o) return finish(s, ok(s.resolveChoice(i.playerIndex, o.value)), false) } const o = i.request.options.find(o => o.sourceCard === 'E105_Pioneer' && o.value !== '__skip__' && o.value !== '__pass__'); assert.ok(o); r = ok(s.resolveChoice(i.playerIndex, o.value)) } assert.fail('Pioneer reward choice missing') }
export function sell(s: GameSession, response: SessionResponse, wanted: ('wood' | 'clay' | 'reed' | 'stone')[]) { let r = response, index = 0; for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) { const i = r.interaction; assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger', JSON.stringify(i)); if (i.request.kind === 'select-trigger') { const o = i.request.options.find(o => o.sourceCard === 'E106_EmergencySeller' && o.value !== '__pass__'); assert.ok(o); r = ok(s.resolveChoice(0, o.value)); continue } const resource = wanted[index], o = resource ? i.request.options.find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && o.effectPreview.resourcesPaid?.[resource] === 1) : i.request.options.find(o => o.value === '__skip__' || o.value === '__done__'); if (o) { const before = resource ? r.state.players[0]!.resources[resource] : 0; r = ok(s.resolveChoice(0, o.value)); if (resource && r.state.players[0]!.resources[resource] === before - 1) index++ } else { const accept = i.request.options.find(o => o.value !== '__skip__' && o.value !== '__done__'); assert.ok(accept, JSON.stringify(i)); r = ok(s.resolveChoice(0, accept.value)) } } return finish(s, r, false) }
export function workTrade(s: GameSession, card: string, resource: 'grain' | 'vegetable') { const p = ok(s.takeAnytimeAction(0, 'exchange')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice', JSON.stringify(p.interaction)); assert.equal(p.interaction.request.options.some(o => o.sourceCard === card), false); const o = p.interaction.request.options.find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && o.effectPreview.resourcesPaid?.[resource] === 1 && 'resourcesGained' in o.effectPreview && o.effectPreview.resourcesGained?.food === 2); assert.ok(o, JSON.stringify(p.interaction)); const r = finish(s, ok(s.resolveChoice(0, o.value)), false); assert.equal(r.state.players[0]!.resources[resource], 0); assert.equal(r.state.players[0]!.resources.food, 102); return { p, r } }

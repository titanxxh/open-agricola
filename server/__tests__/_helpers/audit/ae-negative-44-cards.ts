// Helpers of ae-negative-44-cards-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { markAllWorkersUsed } from '../../../../shared/domain/player'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/44/oa-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)) }
export function make(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 8) {
  const s = createWorkSession({ seed: 4244, options: { playerCount: 2 }, configure(state) {
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
export function fence(s: GameSession, edges = ONE, accept = true) { ready(s); const p = ok(s.takeAction(0, 'fencing')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); return finish(s, ok(s.commitSelectionChoice(0, { edges, palisadeEdges: [] })), accept) }
export function build(s: GameSession, kind: 'room' | 'stable', tiles?: { row: number; col: number }[]) { ready(s); let p = ok(s.takeAction(0, 'farm-expansion')); if (p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice') p = choose(s, p, kind === 'room' ? 'actions.construct.name' : 'actions.stables.name'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select', JSON.stringify(p.interaction)); assert.equal(p.interaction.request.farm.farmType, kind); const selected = tiles ?? [p.interaction.request.farm.selectableTiles[0]!]; return finish(s, ok(s.commitSelectionChoice(0, kind === 'room' ? { rooms: selected } : { stables: selected })), false) }
export function rooms(p: PlayerState, n: number, house: PlayerState['houseType']) { p.rooms = n; p.houseType = house; p.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, n) }
export function anytime(s: GameSession, card: string) { const r = ok(s.getState()); const a = r.interaction.anytimeActions.find(a => JSON.stringify(a).includes(card)); assert.ok(a, JSON.stringify(r.interaction)); return ok(s.takeAnytimeAction(0, a.id)) }
export function future(r: SessionResponse, card: string) { return r.state.futureMeeples.filter(e => e.playerId === r.state.players[0]!.id && e.cardId === card).map(e => ({ round: e.round, resources: e.resources })) }
export function reach(s: GameSession, target: number) { let r = ok(s.getState()); for (let n = 0; n < 100; n++) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); if (r.state.round === target) return ok(r); r = finish(s, r, false); if (r.state.round === target) return ok(r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); const actor = r.state.currentPlayerIndex, space = ['grain-seeds', 'day-laborer', 'clay-pit', 'reed-bank', 'forest', 'fishing'].find(id => s.getActionAvailability(actor)[id]); assert.ok(space); r = ok(s.takeAction(actor, space)) } assert.fail('Natural target round not reached') }
export const PRIORS = ['B121_Geologist', 'C123_Freemason', 'D122_ClayCarrier', 'E142_Smuggler', 'A100_Curator']
export function end(s: GameSession) { for (const p of s.state.players) markAllWorkersUsed(s.state, p); s.loadState(s.state); return ok(s.performRoundEnd()) }
export function dung(species: number) { return make('E090_DungCollector', st => { const p = st.players[0]!; for (let i = 0; i < species; i++) { const type = i === 0 ? 'sheep' : 'boar'; const col = 1 + i; p.pastures.push({ id: type, tiles: [{ row: 0, col }], animalType: type, animalCount: 2 }); p.stableTiles.push({ row: 0, col }); p.fenceSegments.push(...[`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`].map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))); p.resources[type] = 2 } p.fenceSegments = [...new Map(p.fenceSegments.map(segment => [segment.edge, segment])).values()]; assert.equal(p.fenceSegments.length, species === 2 ? 7 : 4); assert.equal(p.stableTiles.length, species) }, true, 4) }
export function harvestDung(s: GameSession, accept: boolean) { let r = end(s); for (let n = 0; n < 32; n++) { const i = r.interaction; if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player') return ok(r); if (i.request.kind === 'animal-reorg') { const zones = i.request.zones.map(z => z.id === 'sheep' ? { ...z, animalType: 'sheep', animalCount: 3 } : z.id === 'boar' ? { ...z, animalType: 'boar', animalCount: 3 } : { ...z, animalType: null, animalCount: 0 }); r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones })) } else if (i.request.kind === 'feed') r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] })); else if (i.request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm')); else return finish(s, r, accept) } assert.fail('Harvest did not settle') }
export function joineryMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); for (let n = 0; n < 8; n++) { const i = r.interaction; assert.ok(i.stateId === 'wait' && i.request.kind === 'choice', JSON.stringify(i)); if (i.request.options.some(o => o.value === 'Major_Joinery') || i.request.options.some(o => o.value === 'B007_Wage')) return r; const o = i.request.options.find(o => o.labelKey === 'actions.improvement.name') ?? i.request.options.find(o => o.value !== '__skip__'); assert.ok(o); r = ok(s.resolveChoice(0, o.value)) } assert.fail('Minor menu not reached') }

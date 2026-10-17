// Helpers of ae-negative-09-sources-session.test.ts from the negative audit snapshot fafd4f51b.
import { countRoomAnimals } from '../../../../shared/domain/animals'
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState, Resource } from '../../../../shared/contract/types'
import type { ZoneAssignment } from '../../../../shared/actions/effects/reorganize'
import { getOwnOrdinaryFenceReserveCount } from '../../../../shared/domain/supply-tokens'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, assertRuleOutcome, confirmNext } from '../negative-rule-audit'

export const DISH = 'A066_FeedingDish', SCOOP = 'A067_CornScoop', GIFT = 'A068_AsparagusGift'
export type Animal = 'sheep' | 'boar' | 'cattle'
export const spaces = { sheep: 'sheep-market', boar: 'pig-market', cattle: 'cattle-market' }
export const sessions: GameSession[] = []
export const artifactRoot = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/09-sources-probes'
export function save(name: string, value: unknown) { fs.mkdirSync(artifactRoot, { recursive: true }); fs.writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify(value, null, 2)) }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { round = 14, played = true, resources = {} }: { round?: number; played?: boolean; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
    state.round = round; state.availableMajorImprovements = []
    for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']; p.minorPlayed = played ? [card] : []
    Object.assign(p.resources, resources); configure(state)
  } }); sessions.push(s); s.withCtx(() => { for (const p of s.state.players) assert.equal(getOwnOrdinaryFenceReserveCount(p), 15 - p.fenceSegments.length) }); return s
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function buyMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const entry = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-')); if (entry) r = ok(s.resolveChoice(0, entry.value)) } return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (!r.state.players[0]!.minorHand.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !o.disabled)); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export let nativeSequence = 0
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const before = s.getState(), r = ok(s.takeAction(actor, space)); save(`native-${++nativeSequence}`, { command: 'takeAction', actor, space, before, response: r }); return r }
export const one = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export function fences(p: PlayerState, edges: string[]) { p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })) }
export function house(p: PlayerState, animal: Animal, prior: number) { fences(p, one); p.stableTiles = [{ row: 0, col: 1 }]; p.pastures = [{ id: `dish-${p.id}`, tiles: [{ row: 0, col: 1 }], animalType: prior ? animal : null, animalCount: prior }]; p.resources[animal] = prior }
export function market(animal: Animal = 'sheep', prior = 0, gain = 1, played = true, configure: (state: GameState) => void = () => {}) { const s = setup(DISH, { played }, state => { house(state.players[0]!, animal, prior); house(state.players[1]!, animal, 0); state.actionSpaces.find(a => a.id === spaces[animal])!.resources[animal] = gain; configure(state) }); const p = s.getState().state.players[0]!; assert.equal(p.resources[animal], prior); assert.equal(p.pastures[0]!.animalCount, prior); assert.equal(s.getState().state.actionSpaces.find(a => a.id === spaces[animal])!.resources[animal], gain); return s }
export function settle(s: GameSession, r: SessionResponse, actor = 0) {
  for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'select-trigger') { const o = r.interaction.request.options.find(o => o.value !== '__skip__'); assert.ok(o); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value)); continue }
    if (r.interaction.request.kind !== 'animal-reorg') break
    const p = r.state.players[actor]!, zones: ZoneAssignment[] = []
    for (const animal of ['sheep', 'boar', 'cattle'] satisfies Animal[]) if (p.resources[animal]) {
      if (p.houseAnimals['2-0'] === animal && countRoomAnimals(p)) zones.push({ id: 'house:2-0', zoneType: 'house', animalType: animal, animalCount: countRoomAnimals(p) })
      else zones.push({ id: `dish-${p.id}`, zoneType: 'pasture', animalType: animal, animalCount: p.resources[animal] })
    }
    r = ok(s.resolveChoice(actor, 'confirm', { zones }))
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); return r
}
export function collect(s: GameSession, animal: Animal, actor = 0) { return settle(s, turn(s, actor, spaces[animal]), actor) }
export function first(animal: Animal, id: string) { const s = market(animal); const r = collect(s, animal); assert.equal(r.state.players[0]!.resources[animal], 1); assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 1); save(id, r); assertRuleOutcome({ grain: r.state.players[0]!.resources.grain }, { grain: 0 }) }
export function cook(s: GameSession) { const r = ok(s.takeAnytimeAction(0, 'exchange')); const o = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === 1); assert.ok(o); assert.ok(o.value.startsWith('trade:')); return ok(s.resolveChoice(0, `bulk:${o.value.split(':')[1]}=1`)) }
export function gift({ played = true, wood = 10, edges = [] }: { played?: boolean; wood?: number; edges?: string[] } = {}, configure: (state: GameState) => void = () => {}) { return setup(GIFT, { round: 4, played, resources: { wood } }, state => { state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]; fences(state.players[0]!, edges); configure(state) }) }
export function commit(s: GameSession, edges = one, actor = 0) { return ok(s.commitSelectionChoice(actor, { edges, palisadeEdges: [], extraWood: 0 })) }
export function fence(s: GameSession, edges = one, actor = 0) { const r = turn(s, actor, 'fencing'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction)); return commit(s, edges, actor) }
export function outcome(s: GameSession, r: SessionResponse, actor = 0) { const p = r.state.players[actor]!; return { wood: p.resources.wood, fences: p.fenceSegments.length, reserveFences: s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), vegetable: p.resources.vegetable } }

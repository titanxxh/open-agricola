// Helpers of ae-negative-05-housing-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import type { ZoneAssignment } from '../../../../shared/actions/effects/reorganize'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const SHED = 'A010_WoodenShed'
export const MUD = 'A011_MudPatch'
export const TROUGH = 'A012_DrinkingTrough'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function enclose(p: PlayerState, size = 1, stableCount = 0, twoPastures = false) {
  const tiles = Array.from({ length: size }, (_, row) => ({ row, col: 3 }))
  p.pastures = [{ id: 'pasture-0', tiles, animalType: null, animalCount: 0 }]
  const edges = [`H-0-3`, `H-${size}-3`, ...tiles.flatMap(t => [`V-${t.row}-3`, `V-${t.row}-4`])]
  if (twoPastures) {
    p.pastures.push({ id: 'pasture-1', tiles: [{ row: 1, col: 3 }], animalType: null, animalCount: 0 })
    edges.push('H-2-3', 'V-1-3', 'V-1-4')
  }
  p.fenceSegments = [...new Set(edges)].map(edge => ({ edge, type: 'fence' }))
  p.stableTiles = tiles.slice(0, stableCount)
}
export function setup({ card = SHED, played = false, round = 14, resources = {}, houseType = 'wood', emptyFields = 0, plantedFields = 0, cardField = false, houseSheep = false, pastureSize = 0, stableCount = 0, twoPastures = false, opponentPasture = false, opponentFields = false, angler = false, looseStable = false, mudAlso = false, markets = {} }: {
  card?: string; played?: boolean; round?: number; resources?: Partial<PlayerState['resources']>; houseType?: PlayerState['houseType']; emptyFields?: number; plantedFields?: number; cardField?: boolean; houseSheep?: boolean; pastureSize?: number; stableCount?: number; twoPastures?: boolean; opponentPasture?: boolean; opponentFields?: boolean; angler?: boolean; looseStable?: boolean; mudAlso?: boolean; markets?: Record<string, Partial<PlayerState['resources']>>
} = {}) {
  const s = createWorkSession({ seed: 42, options: { playerCount: 2 }, configure: state => {
    state.round = round; state.availableMajorImprovements = []
    for (const p of state.players) p.resources.food = 40
    const p = state.players[0]!
    p.houseType = houseType
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
    p.minorPlayed = [...(played ? [card] : []), ...(cardField ? ['A038_BeanField'] : []), ...(mudAlso ? [MUD] : [])]
    if (angler) p.occupationPlayed = ['A095_Angler']
    Object.assign(p.resources, resources)
    if (houseSheep) { p.resources.sheep = 1; p.houseAnimals = { '2-0': 'sheep' }}
    p.fields = Array.from({ length: emptyFields + plantedFields }, (_, col) => ({ row: 0, col: col + 1, stacks: col < emptyFields ? [] : [{ kind: 'grain', remaining: 2 }] }))
    if (pastureSize > 0) enclose(p, pastureSize, stableCount, twoPastures)
    if (opponentFields) state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
    if (opponentPasture) enclose(state.players[1]!)
    if (looseStable) p.stableTiles = [{ row: 0, col: 3 }]
    for (const [id, values] of Object.entries(markets)) Object.assign(state.actionSpaces.find(a => a.id === id)!.resources, values)
    if (angler) state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 1
  } })
  sessions.push(s); assert.equal(s.getState().interaction.stateId, 'idle'); return s
}
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string }) => boolean) {
  assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
  const o = r.interaction.request.options.find(predicate); assert.ok(o, JSON.stringify(r.interaction))
  return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function purchaseFrom(s: GameSession, r: SessionResponse, card: string) {
  for (let n = 0; n < 8 && r.state.players[0]!.minorHand.includes(card) && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'select-trigger') { r = choose(s, r, o => o.value !== '__pass__'); continue }
    if (r.interaction.request.kind !== 'choice') break
    const o = r.interaction.request.options.find(o => o.value === card || o.value.startsWith('action-improvement-') || o.value.startsWith('flow-'))
    if (!o) break
    r = ok(s.resolveChoice(0, o.value))
  }
  return r
}
export function purchase(s: GameSession, card: string, space = 'major-improvement') { ready(s, 0); return purchaseFrom(s, s.takeAction(0, space), card) }
export function blockedPurchase(s: GameSession, card: string, space = 'major-improvement') {
  const goods = { ...s.state.players[0]!.resources }; const r = purchase(s, card, space)
  assert.ok(r.state.players[0]!.minorHand.includes(card)); assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
  assert.deepEqual(r.state.players[0]!.resources, goods); assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
}
export function reorg(r: SessionResponse) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction)); return r.interaction.request.zones
}
export function mudCapacity(r: SessionResponse) { return reorg(r).find(z => z.id === `card:${MUD}`)?.capacity ?? 0 }
export function assign(s: GameSession, actor: number, zones: ZoneAssignment[]) { return ok(s.resolveChoice(actor, 'confirm', { zones })) }
export function zone(id: string, animalType: ZoneAssignment['animalType'], animalCount: number, zoneType: ZoneAssignment['zoneType'] = 'card'): ZoneAssignment { return { id, zoneType, animalType, animalCount } }
export function house() { return zone('house:2-0', 'sheep', 1, 'house') }
export function boars(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources.boar }
export function finished(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)) }
export function finishGrowth(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.value === '__skip__' || o.value === '__done__')
  return r
}

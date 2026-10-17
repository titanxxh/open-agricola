// Helpers of ae-negative-54-resources-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/54/probes'
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return r; }
export function options(r: SessionResponse): ActionChoiceOption[] { const i = r.interaction; return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []; }
export function gains(o: ActionChoiceOption, key: 'food' | 'vegetable' | 'grain' | 'wood' | 'clay' | 'reed' | 'stone') { const p = o.effectPreview; return p?.kind === 'resourceBundle' || p?.kind === 'resourceMovement' ? p.resources[key] : p && 'resourcesGained' in p ? p.resourcesGained?.[key] : undefined; }
export function actor(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait'); return r.interaction.playerIndex; }
export function save(id: string, r: SessionResponse) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ round: r.state.round, players: r.state.players.map(p => ({ resources: p.resources, family: familySize(p), rooms: p.rooms, house: p.houseType, fields: p.fields, stableTiles: p.stableTiles, pastures: p.pastures, fenceSegments: p.fenceSegments, roomTiles: p.roomTiles, occupations: p.occupationPlayed, minors: p.minorPlayed, improvements: p.improvements, cardStates: p.cardStates, workers: p.workers })), spaces: r.state.actionSpaces.map(a => ({ id: a.id, resources: a.resources, takenBy: a.takenBy })), future: r.state.futureMeeples, interaction: r.interaction, log: r.state.log, events: r.state.events, scores: r.scores }, null, 2)); }
export function setup(card: string, round = 14, configure: (state: GameState) => void = () => { }, players = ['C148_MudWallower', 'D148_DomesticianExpert'].includes(card) ? 4 : 3) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
      state.round = round
      for (const p of state.players) {
        p.minorHand = ['__test_placeholder__']
        p.occupationHand = ['__test_placeholder__']
        Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
      }
      state.players[0]!.occupationPlayed = [card]
      for (const [id, key, n] of [['forest', 'wood', 3], ['clay-pit', 'clay', 2], ['reed-bank', 'reed', 2], ['fishing', 'food', 1], ['western-quarry', 'stone', 2], ['grove', 'wood', 3], ['hollow', 'clay', 2], ['traveling-players', 'food', 2]] as const) {
        const space = state.actionSpaces.find(a => a.id === id)
        if (space)
          space.resources[key] = n
      }
      configure(state)
    } })
  sessions.push(s)
  return s
}
export function choose(s: GameSession, r: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) { const option = options(r).find(predicate); assert.ok(option, JSON.stringify(r.interaction)); return ok(s.resolveChoice(actor(r), option.value)); }
export function source(s: GameSession, r: SessionResponse, card: string) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
    r = choose(s, r, o => o.value === card)
  return r
}
export function finish(s: GameSession, r: SessionResponse, accept = false) {
  for (let n = 0; n < 64 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
    r = passPreparationExchanges(s, r)
    if (r.interaction.stateId !== 'wait')
      break
    const i = r.interaction
    if (i.request.kind === 'confirm-player-switch')
      r = ok(s.resolveChoice(i.playerIndex, 'confirm'))
    else if (i.request.kind === 'feed')
      r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
    else if (i.request.kind === 'animal-reorg')
      r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
    else if (i.request.kind === 'select-trigger')
      r = choose(s, r, o => o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name')
    else if (i.request.kind === 'farm-select' && i.request.farm.farmType === 'plow')
      r = ok(s.commitSelectionChoice(i.playerIndex, { tile: i.request.farm.selectableTiles[0]! }))
    else
      r = choose(s, r, o => accept ? !['__skip__', '__done__', '__pass__'].includes(o.value) : ['__skip__', '__done__', '__pass__'].includes(o.value) || (!options(r).some(o => ['__skip__', '__done__', '__pass__'].includes(o.value)) && o.labelKey === 'actions.plow.name'))
  }
  return r
}
export function next(s: GameSession) { let r = ok(s.getState()); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return r; }
export function completeRound(s: GameSession, spaces = s.state.players.length === 2 ? ['clay-pit', 'forest', 'fishing', 'reed-bank'] : s.state.players.length === 4 ? ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'grove', 'hollow'] : ['clay-pit', 'forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer']) {
  let r = s.getState()
  for (const space of spaces) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    r = finish(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    r = ok(s.takeAction(r.state.currentPlayerIndex, space))
    if (space !== spaces.at(-1))
      r = finish(s, r)
  }
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = confirmNext(s, r)
  return r
}
export function lesson(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'lessons'))
  if (r.state.players[0]!.occupationHand.includes(card))
    r = choose(s, r, o => o.value === card)
  return r
}
export function play(s: GameSession, card: string) { const p = s.state.players[0]!; p.occupationPlayed = []; p.occupationHand = [card]; s.loadState(s.state); return lesson(s, card); }
export function improvement(s: GameSession, r: SessionResponse, card: string) {
  for (let n = 0; n < 8 && !r.state.players[0]!.improvements.includes(card); n++) {
    const target = options(r).find(o => o.value === card), entry = target ?? options(r).find(o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name')
    assert.ok(entry, JSON.stringify(r.interaction))
    r = ok(s.resolveChoice(actor(r), entry.value))
  }
  assert.ok(r.state.players[0]!.improvements.includes(card))
  return r
}
export function switchActor(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch')
    return ok(s.resolveChoice(actor(r), 'confirm'))
  return r
}
export function offer(s: GameSession, r: SessionResponse, card: string) { r = switchActor(s, r); r = source(s, r, card); return r; }
export function take(s: GameSession, space: string) { const r = s.getState(); assert.equal(r.interaction.stateId, 'idle'); return ok(s.takeAction(r.state.currentPlayerIndex, space)); }
export function move(s: GameSession, space: string) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = confirmNext(s, r)
  assert.equal(r.interaction.stateId, 'idle')
  return finish(s, ok(s.takeAction(r.state.currentPlayerIndex, space)))
}
export function farm(state: GameState, n: number, fenced = true) {
  const p = state.players[0]!
  const tiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 3 }, { row: 1, col: 4 }]
  p.stableTiles = tiles.slice(0, n)
  if (fenced) {
    p.pastures = [{ id: 'legal-pasture', tiles, animalType: null, animalCount: 0 }]
    p.fenceSegments = ['H-0-3', 'H-0-4', 'H-2-3', 'H-2-4', 'V-0-3', 'V-1-3', 'V-0-5', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  }
}
export function wallow(s: GameSession, r: SessionResponse) {
  for (let n = 0; n < 80 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
    if (r.interaction.request.kind === 'animal-reorg') {
      const zones = r.interaction.request.zones
      const c = zones.find(z => z.id === 'card:C148_MudWallower')
      const held = Number(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held ?? 0)
      const pig = r.state.players[0]!.resources.boar
      const pasture = zones.find(z => z.zoneType === 'pasture')
      const assigned = []
      if (c && held)
        assigned.push({ ...c, animalType: 'boar' as const, animalCount: Math.min(held, pig), animalCounts: { boar: Math.min(held, pig) } })
      if (pig > held) {
        assert.ok(pasture)
        assigned.push({ ...pasture, animalType: 'boar' as const, animalCount: pig - held, animalCounts: { boar: pig - held } })
      }
      r = ok(s.resolveChoice(actor(r), 'confirm', { zones: assigned }))
    }
    else
      r = finish(s, r)
  }
  return r
}
export function wallowRound(s: GameSession, spaces: string[]) {
  let r = s.getState()
  for (const space of spaces) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    r = wallow(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    r = wallow(s, ok(s.takeAction(r.state.currentPlayerIndex, space)))
  }
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = confirmNext(s, r)
  return wallow(s, r)
}

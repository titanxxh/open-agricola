// Helpers of ae-negative-31-plows-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/31/probes'
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return r; }
export function options(r: SessionResponse): ActionChoiceOption[] { const i = r.interaction; return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []; }
export function actor(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait'); return r.interaction.playerIndex; }
export function save(id: string, r: SessionResponse) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ round: r.state.round, engineStack: sessions.find(s => s.state === r.state)?.getEngineStack().toCursor(), players: r.state.players.map(p => ({ resources: p.resources, family: familySize(p), rooms: p.rooms, house: p.houseType, fields: p.fields, stableTiles: p.stableTiles, stableAnimals: p.stableAnimals, houseAnimals: p.houseAnimals, pastures: p.pastures, fenceSegments: p.fenceSegments, roomTiles: p.roomTiles, occupations: p.occupationPlayed, minors: p.minorPlayed, improvements: p.improvements, cardStates: p.cardStates, workers: p.workers })), spaces: r.state.actionSpaces.map(a => ({ id: a.id, resources: a.resources, takenBy: a.takenBy })), future: r.state.futureMeeples, interaction: r.interaction, log: r.state.log, events: r.state.events, scores: r.scores }, null, 2)); }
export function setup(card: string, round = 14, configure: (state: GameState) => void = () => { }, players = card.startsWith('B16') ? 4 : 2) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
      state.round = round
      for (const p of state.players) {
        p.minorHand = ['__test_placeholder__']
        p.occupationHand = ['__test_placeholder__']
        Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
      }
      if (card.startsWith('B16'))
        state.players[0]!.occupationPlayed = [card]
      else {
        state.players[0]!.minorPlayed = [card]
        const n = card === 'C019_SwingPlow' ? 3 : card === 'D019_PulverizerPlow' ? 1 : ['D020_TurnwrestPlow', 'E017_SkimmerPlow'].includes(card) ? 2 : card === 'E018_SeedAlmanac' ? 4 : 0
        prerequisites(state, n ?? 0)
      }
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
      r = ok(s.commitSelectionChoice(i.playerIndex, { tile: i.request.farm.selectableTiles.find(t => !r.state.players[i.playerIndex]!.fields.some(f => f.row === t.row && f.col === t.col))! }))
    else
      r = choose(s, r, o => accept ? !['__skip__', '__done__', '__pass__'].includes(o.value) : ['__skip__', '__done__', '__pass__'].includes(o.value) || (!options(r).some(o => ['__skip__', '__done__', '__pass__'].includes(o.value)) && o.labelKey === 'actions.plow.name'))
  }
  return r
}
export function next(s: GameSession) { let r = ok(s.getState()); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return r; }
export function completeRound(s: GameSession, spaces = s.state.players.length === 2 ? ['clay-pit', 'forest', 'fishing', 'reed-bank'] : s.state.players.length === 4 ? ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'] : ['clay-pit', 'forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer']) {
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
export function improvement(s: GameSession, r: SessionResponse, card: string) {
  for (let n = 0; n < 8 && !r.state.players[0]!.minorPlayed.includes(card) && !r.state.players[0]!.improvements.includes(card); n++) {
    const target = options(r).find(o => o.value === card), entry = target ?? options(r).find(o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name')
    assert.ok(entry, JSON.stringify(r.interaction))
    r = ok(s.resolveChoice(actor(r), entry.value))
  }
  assert.ok(r.state.players[0]!.minorPlayed.includes(card) || r.state.players[0]!.improvements.includes(card))
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
export const fillers = ['A125_Priest', 'A110_Roughcaster', 'A124_Knapper', 'A098_StableArchitect']
export function prerequisites(st: GameState, n: number) { st.players[0]!.occupationPlayed = fillers.slice(0, n); }
export function hand(st: GameState, card: string) { const p = st.players[0]!; p.minorPlayed = p.minorPlayed.filter(c => c !== card); p.minorHand = [card]; }
export function buy(s: GameSession, card: string) { return improvement(s, take(s, 'meeting-place'), card); }
export function noSource(r: SessionResponse, card: string) { assert.ok(!JSON.stringify(r.interaction).includes(`"sourceCard":"${card}"`), JSON.stringify(r.interaction)); }
export function plow(s: GameSession, r: SessionResponse) {
  for (let n = 0; n < 12; n++) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
      return ok(s.commitSelectionChoice(actor(r), { tile: r.interaction.request.farm.selectableTiles.find(t => !r.state.players[actor(r)]!.fields.some(f => f.row === t.row && f.col === t.col))! }))
    r = choose(s, r, o => !['__skip__', '__pass__', '__done__'].includes(o.value))
  }
  throw new Error('no plow pending')
}
export function accept(s: GameSession, r: SessionResponse, card: string) { r = offer(s, r, card); return choose(s, r, o => !['__skip__', '__pass__', '__done__'].includes(o.value)); }
export function sow(s: GameSession, r: SessionResponse, crops: {
  row: number
  col: number
  crop: 'grain' | 'vegetable'
}[]) {
  for (let n = 0; n < 12; n++) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
      return ok(s.commitSelectionChoice(actor(r), { crops }))
    r = choose(s, r, o => o.labelKey === 'actions.sow.name' || o.value === 'sow' || !['__skip__', '__done__', '__pass__'].includes(o.value))
  }
  throw new Error('no sow pending')
}
export function planted(st: GameState, n = 3) { st.players[0]!.fields = Array.from({ length: n }, (_, i) => ({ row: 0, col: i + 2, stacks: [{ kind: i === 1 ? 'vegetable' : 'grain', remaining: i === 1 ? 2 : 3 }] })); }
export function advanceOwner(s: GameSession, r: SessionResponse) { finish(s, r); next(s); move(s, 'reed-bank'); next(s); }
export function minorSetup(card: string, wood: number, occ = 0, food = 20, round = 14) { return setup(card, round, st => { hand(st, card); prerequisites(st, occ); Object.assign(st.players[0]!.resources, { wood, food }); }); }
export const legalRounds = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment']
export function boundary(tiles: {
  row: number
  col: number
}[]) {
  const counts = new Map<string, number>()
  for (const t of tiles)
    for (const e of [`H-${t.row}-${t.col}`, `H-${t.row + 1}-${t.col}`, `V-${t.row}-${t.col}`, `V-${t.row}-${t.col + 1}`])
      counts.set(e, (counts.get(e) ?? 0) + 1)
  return [...counts].filter(([, n]) => n === 1).map(([e]) => e)
}
export function pasture(st: GameState, tiles: {
  row: number
  col: number
}[], animal: 'sheep' | 'boar' | 'cattle' | null = null, count = 0, stable = false, id = 'p1') {
  const p = st.players[0]!
  p.pastures.push({ id, tiles, animalType: animal, animalCount: count })
  const edges = boundary(tiles)
  for (const edge of edges)
    if (!p.fenceSegments.some(f => f.edge === edge))
      p.fenceSegments.push({ edge, type: 'fence' })
  if (stable)
    p.stableTiles.push(tiles[0]!)
  if (animal)
    p.resources[animal] += count
}
export function animalKeep(s: GameSession, r: SessionResponse, assign: (z: Extract<SessionResponse['interaction'], {
  stateId: 'wait'
}>['request'] & {
  kind: 'animal-reorg'
}) => void) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
    const req = structuredClone(r.interaction.request)
    assign(req)
    r = ok(s.resolveChoice(actor(r), 'confirm', { zones: req.zones }))
  }
  return r
}
export function fence(s: GameSession, r: SessionResponse, edges: string[]) {
  for (let n = 0; n < 12; n++) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'fence')
      return ok(s.commitSelectionChoice(actor(r), { edges, palisadeEdges: [], extraWood: 0 }))
    r = choose(s, r, o => !['__skip__', '__pass__', '__done__'].includes(o.value))
  }
  throw new Error('no fence pending')
}
export function grainHarvest(st: GameState, card: string, handOnly = false) {
  const p = st.players[0]!
  p.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }, { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] }, { row: 0, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] }, { row: 1, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] }]
  pasture(st, [{ row: 1, col: 2 }, { row: 1, col: 3 }])
  if (handOnly) {
    p.occupationPlayed = []
    p.occupationHand = [card]
  }
}
export function harvestOffer(s: GameSession, card: string) { let r = completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4']); r = offer(s, r, card); return accept(s, r, card); }
export function sergeant(st: GameState, food: number, capacity = true) {
  const p = st.players[0]!
  p.occupationPlayed = []
  p.occupationHand = ['B167_StableSergeant']
  p.resources.food = food
  if (capacity) {
    pasture(st, [{ row: 0, col: 3 }])
    p.stableTiles = [{ row: 1, col: 3 }]
  }
}
export function renovate(s: GameSession, r: SessionResponse) {
  for (let n = 0; n < 12 && r.state.players[actor(r)]?.houseType === 'wood'; n++)
    r = choose(s, r, o => o.value === 'clay' || o.value.includes('renovate') || !['__skip__', '__done__', '__pass__'].includes(o.value))
  return r
}

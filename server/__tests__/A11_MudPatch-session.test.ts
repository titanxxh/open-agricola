import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A011_MudPatch'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A011_MudPatch'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  emptyFields = 1,
  plantedFields = 0,
  market = 'pig-market',
  animal = 'boar',
  count = 1,
}: {
  played?: boolean
  emptyFields?: number
  plantedFields?: number
  market?: 'pig-market' | 'sheep-market'
  animal?: 'boar' | 'sheep'
  count?: number
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5011, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = played ? [CARD_ID] : []
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources = { ...player.resources, wood: 0, boar: 0, sheep: 0, cattle: 0 }
  const positions = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
  player.fields = positions.slice(0, emptyFields + plantedFields).map((position, index) => ({
    ...position,
    stacks: index < emptyFields ? [] : [{ kind: 'grain' as const, remaining: 2 }],
  }))
  player.houseAnimals = {}
  player.stableAnimals = {}
  player.pastures = []
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  const space = state.actionSpaces.find((candidate) => candidate.id === market)
  if (!space) throw new Error(`missing action space ${market}`)
  space.takenBy = []
  space.resources[animal] = count
  session.loadState(state)
  return session
}
const playMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const enter = getChoiceOptions(response)?.find((option) => option.value.startsWith('action-improvement-'))
    if (enter)
      response = session.resolveChoice(0, enter.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID))
    return response
  if (response.interaction.stateId !== 'wait')
    return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}
const expectReorganization = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response
}
const mudPatchZone = (response: SessionResponse) => {
  const pending = expectReorganization(response)
  if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal reorganization')
  const zone = pending.interaction.request.zones.find((candidate) => candidate.id === `card:${CARD_ID}`)
  expect(zone).toBeDefined()
  return zone!
}
describe('A011 Mud Patch parity', () => {
  it('A011 S1: playing Mud Patch immediately gains one boar that an empty field can hold', () => {
    const session = setup({ played: false })
    let response = playMinor(session)
    const zone = mudPatchZone(response)
    expect(zone).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })
    response = session.resolveChoice(0, 'confirm', { zones: [
        { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })
  it('A011 S2: two empty fields can hold two boars collected from Pig Market', () => {
    const session = setup({ emptyFields: 2, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 2, allowedAnimalType: 'boar' })
    response = session.resolveChoice(0, 'confirm', { zones: [
        { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 2 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
  it('A011 S3: a planted field adds no Mud Patch boar capacity', () => {
    const session = setup({ emptyFields: 1, plantedFields: 1, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })
    response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
        { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
  it('A011 S4: an empty field cannot hold sheep through Mud Patch', () => {
    const session = setup({ market: 'sheep-market', animal: 'sheep', count: 2 })
    let response = session.takeAction(0, 'sheep-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })
    response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})
describe("A011 command boundaries", () => {
  const SHED = 'A010_WoodenShed'
  const MUD = 'A011_MudPatch'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function enclose(p: PlayerState, size = 1, stableCount = 0, twoPastures = false) {
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
  function setup({ card = SHED, played = false, round = 14, resources = {}, houseType = 'wood', emptyFields = 0, plantedFields = 0, cardField = false, houseSheep = false, pastureSize = 0, stableCount = 0, twoPastures = false, opponentPasture = false, opponentFields = false, angler = false, looseStable = false, mudAlso = false, markets = {} }: {
    card?: string
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    houseType?: PlayerState['houseType']
    emptyFields?: number
    plantedFields?: number
    cardField?: boolean
    houseSheep?: boolean
    pastureSize?: number
    stableCount?: number
    twoPastures?: boolean
    opponentPasture?: boolean
    opponentFields?: boolean
    angler?: boolean
    looseStable?: boolean
    mudAlso?: boolean
    markets?: Record<string, Partial<PlayerState['resources']>>
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          p.resources.food = 40
        const p = state.players[0]!
        p.houseType = houseType
        p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
        p.minorPlayed = [...(played ? [card] : []), ...(cardField ? ['A038_BeanField'] : []), ...(mudAlso ? [MUD] : [])]
        if (angler)
          p.occupationPlayed = ['A095_Angler']
        Object.assign(p.resources, resources)
        if (houseSheep) {
          p.resources.sheep = 1
          p.houseAnimals = { '2-0': 'sheep' }
        }
        p.fields = Array.from({ length: emptyFields + plantedFields }, (_, col) => ({ row: 0, col: col + 1, stacks: col < emptyFields ? [] : [{ kind: 'grain', remaining: 2 }] }))
        if (pastureSize > 0)
          enclose(p, pastureSize, stableCount, twoPastures)
        if (opponentFields)
          state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
        if (opponentPasture)
          enclose(state.players[1]!)
        if (looseStable)
          p.stableTiles = [{ row: 0, col: 3 }]
        for (const [id, values] of Object.entries(markets))
          Object.assign(state.actionSpaces.find(a => a.id === id)!.resources, values)
        if (angler)
          state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 1
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    const o = getChoiceOptions(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function purchaseFrom(s: GameSession, r: SessionResponse, card: string) {
    for (let n = 0; n < 8 && r.state.players[0]!.minorHand.includes(card) && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'select-trigger') {
        r = choose(s, r, o => o.value !== '__pass__')
        continue
      }
      if (r.interaction.request.kind !== 'choice')
        break
      const o = getChoiceOptions(r).find(o => o.value === card || o.value.startsWith('action-improvement-') || o.value.startsWith('flow-'))
      if (!o)
        break
      r = ok(s.resolveChoice(0, o.value))
    }
    return r
  }
  function purchase(s: GameSession, card: string, space = 'major-improvement') { ready(s, 0); return purchaseFrom(s, s.takeAction(0, space), card); }
  function reorg(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    return r.interaction.request.zones
  }
  function mudCapacity(r: SessionResponse) { return reorg(r).find(z => z.id === `card:${MUD}`)?.capacity ?? 0; }
  function assign(s: GameSession, actor: number, zones: ZoneAssignment[]) { return ok(s.resolveChoice(actor, 'confirm', { zones })); }
  function zone(id: string, animalType: ZoneAssignment['animalType'], animalCount: number, zoneType: ZoneAssignment['zoneType'] = 'card'): ZoneAssignment { return { id, zoneType, animalType, animalCount }; }
  function house() { return zone('house:2-0', 'sheep', 1, 'house'); }
  function boars(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources.boar; }
  it("actual free purchase gains one boar once and undo restores card and animals", () => {
    const s = setup({ card: MUD, emptyFields: 1, houseSheep: true })
    const before = undoRuleSnapshot(s.getState())
    let r = ok(purchase(s, MUD))
    assert.equal(mudCapacity(r), 1)
    assert.equal(boars(r), 1)
    r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)])
    assert.equal(boars(r), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MUD))
    assertUndoRestored(before, s.undoAction())
    r = ok(purchase(s, MUD))
    assert.equal(mudCapacity(r), 1)
    r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)])
    assert.equal(boars(r), 1)
  })
  it("planted and card fields do not add Mud Patch capacity", () => {
    const s = setup({ card: MUD, played: true, emptyFields: 1, plantedFields: 1, cardField: true, markets: { 'pig-market': { boar: 3 } } })
    let r = turn(s, 0, 'pig-market')
    assert.equal(mudCapacity(r), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, 'boar', 3)] }))
    r = assign(s, 0, [zone(`card:${MUD}`, 'boar', 1), zone('house:2-0', 'boar', 1, 'house')])
    assert.equal(boars(r), 2)
    const onlyCard = setup({ card: MUD, played: true, cardField: true, markets: { 'pig-market': { boar: 2 } } })
    r = turn(onlyCard, 0, 'pig-market')
    assert.equal(mudCapacity(r), 0)
    r = assign(onlyCard, 0, [zone('house:2-0', 'boar', 1, 'house')])
    assert.equal(boars(r), 1)
  })
  it("wrong species unknown zone and duplicated count cannot invent housing", () => {
    for (const animal of ['sheep', 'cattle']) {
      const s = setup({ card: MUD, played: true, emptyFields: 1, markets: { [animal === 'sheep' ? 'sheep-market' : 'cattle-market']: { [animal]: 2 } } })
      const r = turn(s, 0, animal === 'sheep' ? 'sheep-market' : 'cattle-market')
      assert.equal(mudCapacity(r), 1)
      const species = animal === 'sheep' ? 'sheep' : 'cattle'
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, species, 1)] }))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone('missing', species, 1)] }))
      const done = assign(s, 0, [zone('house:2-0', species, 1, 'house')])
      assert.equal(done.state.players[0]!.resources[species], 1)
    }
    const s = setup({ card: MUD, played: true, emptyFields: 2, markets: { 'pig-market': { boar: 1 } } })
    turn(s, 0, 'pig-market')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, 'boar', 1), zone(`card:${MUD}`, 'boar', 1)] }))
    assert.equal(boars(assign(s, 0, [zone(`card:${MUD}`, 'boar', 1)])), 1)
  })
  it("real sow shrinks housing and undo restores empty fields and boars", () => {
    const s = setup({ card: MUD, played: true, emptyFields: 2, houseSheep: true, resources: { grain: 1 }, markets: { 'pig-market': { boar: 3 } } })
    let r = turn(s, 0, 'pig-market')
    assert.equal(mudCapacity(r), 2)
    assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 2)])
    turn(s, 1, 'forest')
    ready(s, 0)
    const before = undoRuleSnapshot(s.getState())
    r = turn(s, 0, 'grain-utilization')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = choose(s, r, o => o.value === 'sow' || o.labelKey === 'actions.sow.name')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.equal(mudCapacity(r), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone(`card:${MUD}`, 'boar', 2)] }))
    r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)])
    assert.equal(boars(r), 1)
    assertUndoRestored(before, s.undoAction())
    assert.equal(boars(s.getState()), 2)
    assert.ok(s.state.players[0]!.fields.every(f => f.stacks.length === 0))
  })
  it("opponent does not inherit owner field housing", () => {
    const s = setup({ card: MUD, played: true, emptyFields: 2, opponentFields: true, markets: { 'pig-market': { boar: 2 } } })
    turn(s, 0, 'grain-seeds')
    let r = turn(s, 1, 'pig-market')
    assert.equal(mudCapacity(r), 0)
    r = assign(s, 1, [zone('house:2-0', 'boar', 1, 'house')])
    assert.equal(boars(r, 1), 1)
    assert.equal(boars(r), 0)
  })
  it("aggregate zone proves total capacity but exposes no per field assignment", () => {
    const s = setup({ card: MUD, played: true, emptyFields: 2, houseSheep: true, markets: { 'pig-market': { boar: 3 } } })
    const r = turn(s, 0, 'pig-market')
    const mud = reorg(r).filter(z => z.id === `card:${MUD}`)
    assert.equal(mud.length, 1)
    assert.equal(mud[0]!.capacity, 2)
    assert.equal(reorg(r).filter(z => z.zoneType === 'card').length, 1)
    const done = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 2)])
    assert.equal(boars(done), 2)
    assert.ok(done.state.players[0]!.fields.every(f => f.stacks.length === 0))
  })
})

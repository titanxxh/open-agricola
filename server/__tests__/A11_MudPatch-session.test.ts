import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A011_MudPatch'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Housing from './_helpers/audit/ae-negative-05-housing'

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
  const session = new GameSession(5011, undefined, { playerCount: 2 })
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
  player.houseAnimals = {};
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
    const enter = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (enter) response = session.resolveChoice(0, enter.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
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

    response = session.resolveChoice(0, 'confirm', [
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A011 S2: two empty fields can hold two boars collected from Pig Market', () => {
    const session = setup({ emptyFields: 2, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 2, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 2 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A011 S3: a planted field adds no Mud Patch boar capacity', () => {
    const session = setup({ emptyFields: 1, plantedFields: 1, count: 2 })
    let response = session.takeAction(0, 'pig-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A011 S4: an empty field cannot hold sheep through Mud Patch', () => {
    const session = setup({ market: 'sheep-market', animal: 'sheep', count: 2 })
    let response = session.takeAction(0, 'sheep-market')
    expect(mudPatchZone(response)).toMatchObject({ capacity: 1, allowedAnimalType: 'boar' })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})

describe('ae-negative-05-housing', () => {
  const { MUD, sessions, ok, setup, choose, ready, turn, purchase, reorg, mudCapacity, assign, zone, house, boars } = audit05Housing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Mud Patch negative audit', () => {
    it('A011 N1 actual free purchase gains one boar once and undo restores card and animals', () => {
      const s = setup({ card: MUD, emptyFields: 1, houseSheep: true }); const before = undoRuleSnapshot(s.getState())
      let r = ok(purchase(s, MUD)); assert.equal(mudCapacity(r), 1); assert.equal(boars(r), 1)
      r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)]); assert.equal(boars(r), 1)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, MUD)); assertUndoRestored(before, s.undoAction())
      r = ok(purchase(s, MUD)); assert.equal(mudCapacity(r), 1); r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)]); assert.equal(boars(r), 1)
    })
    it('A011 N2 planted and card fields do not add Mud Patch capacity', () => {
      const s = setup({ card: MUD, played: true, emptyFields: 1, plantedFields: 1, cardField: true, markets: { 'pig-market': { boar: 3 } } })
      let r = turn(s, 0, 'pig-market'); assert.equal(mudCapacity(r), 1)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, 'boar', 3)] }))
      r = assign(s, 0, [zone(`card:${MUD}`, 'boar', 1), zone('house:2-0', 'boar', 1, 'house')]); assert.equal(boars(r), 2)
      const onlyCard = setup({ card: MUD, played: true, cardField: true, markets: { 'pig-market': { boar: 2 } } })
      r = turn(onlyCard, 0, 'pig-market'); assert.equal(mudCapacity(r), 0)
      r = assign(onlyCard, 0, [zone('house:2-0', 'boar', 1, 'house')]); assert.equal(boars(r), 1)
    })
    it('A011 N3 wrong species unknown zone and duplicated count cannot invent housing', () => {
      for (const animal of ['sheep', 'cattle']) {
        const s = setup({ card: MUD, played: true, emptyFields: 1, markets: { [animal === 'sheep' ? 'sheep-market' : 'cattle-market']: { [animal]: 2 } } })
        const r = turn(s, 0, animal === 'sheep' ? 'sheep-market' : 'cattle-market'); assert.equal(mudCapacity(r), 1)
        const species = animal === 'sheep' ? 'sheep' : 'cattle'
        assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, species, 1)] }))
        assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone('missing', species, 1)] }))
        const done = assign(s, 0, [zone('house:2-0', species, 1, 'house')]); assert.equal(done.state.players[0]!.resources[species], 1)
      }
      const s = setup({ card: MUD, played: true, emptyFields: 2, markets: { 'pig-market': { boar: 1 } } }); turn(s, 0, 'pig-market')
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [zone(`card:${MUD}`, 'boar', 1), zone(`card:${MUD}`, 'boar', 1)] }))
      assert.equal(boars(assign(s, 0, [zone(`card:${MUD}`, 'boar', 1)])), 1)
    })
    it('A011 N4 real sow shrinks housing and undo restores empty fields and boars', () => {
      const s = setup({ card: MUD, played: true, emptyFields: 2, houseSheep: true, resources: { grain: 1 }, markets: { 'pig-market': { boar: 3 } } })
      let r = turn(s, 0, 'pig-market'); assert.equal(mudCapacity(r), 2); assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 2)])
      turn(s, 1, 'forest'); ready(s, 0); const before = undoRuleSnapshot(s.getState())
      r = turn(s, 0, 'grain-utilization'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.value === 'sow' || o.labelKey === 'actions.sow.name')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
      r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
      assert.equal(mudCapacity(r), 1)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone(`card:${MUD}`, 'boar', 2)] }))
      r = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 1)]); assert.equal(boars(r), 1)
      assertUndoRestored(before, s.undoAction()); assert.equal(boars(s.getState()), 2); assert.ok(s.state.players[0]!.fields.every(f => f.stacks.length === 0))
    })
    it('A011 N5 opponent does not inherit owner field housing', () => {
      const s = setup({ card: MUD, played: true, emptyFields: 2, opponentFields: true, markets: { 'pig-market': { boar: 2 } } }); turn(s, 0, 'grain-seeds')
      let r = turn(s, 1, 'pig-market'); assert.equal(mudCapacity(r), 0)
      r = assign(s, 1, [zone('house:2-0', 'boar', 1, 'house')]); assert.equal(boars(r, 1), 1); assert.equal(boars(r), 0)
    })
  })
  describe('Mud Patch per-field boundary', () => {
    it('A011 N6 aggregate zone proves total capacity but exposes no per field assignment', () => {
      const s = setup({ card: MUD, played: true, emptyFields: 2, houseSheep: true, markets: { 'pig-market': { boar: 3 } } })
      const r = turn(s, 0, 'pig-market'); const mud = reorg(r).filter(z => z.id === `card:${MUD}`)
      assert.equal(mud.length, 1); assert.equal(mud[0]!.capacity, 2)
      assert.equal(reorg(r).filter(z => z.zoneType === 'card').length, 1)
      const done = assign(s, 0, [house(), zone(`card:${MUD}`, 'boar', 2)])
      assert.equal(boars(done), 2); assert.ok(done.state.players[0]!.fields.every(f => f.stacks.length === 0))
    })
  })
})

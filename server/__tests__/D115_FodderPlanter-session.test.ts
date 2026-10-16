import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/D/D115_FodderPlanter'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'D115_FodderPlanter'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, species = ['sheep'], grain = 2 }: {played?: boolean; species?: ('sheep' | 'boar')[]; grain?: number} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6115, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.pastures = []
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.grain = grain
  player.fields = [
    { row: 0, col: 0, stacks: [] },
    { row: 0, col: 1, stacks: [] },
  ]
  species.forEach((animalType, index) => {
    const type = animalType
    player.resources[type] = 2
    player.pastures.push({
      id: type, animalType: type, animalCount: 2,
      tiles: [{ row: 1, col: index * 2 }, { row: 1, col: index * 2 + 1 }]
    })
  })
  if (!played) {
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.find((space) => space.id === '__test-worker-sink__')!.takenBy = []
    state.players.forEach((candidate) => setWorkersAtHome(state, candidate, 2))
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
  }
  return response
}

const arrange = (session: GameSession, keptSpecies: ('sheep' | 'boar')[]) => {
  const player = session.getState().state.players[0]!
  return session.resolveChoice(0, 'confirm', { zones: keptSpecies.map((animalType) => ({
    id: animalType, zoneType: 'pasture', animalType,
    animalCount: player.resources[animalType],
  })) })
}

const enterSow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow',
  })
  if (response.interaction.stateId !== 'wait') return response
  const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
}

describe('D115 Fodder Planter parity', () => {
  it('D115 S1: Fodder Planter is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false, species: [] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('D115 S2: two kept newborn animal types allow sowing exactly two fields', () => {
    const session = setup({ species: ['sheep', 'boar'] })
    session.performRoundEnd()
    let response = enterSow(session, arrange(session, ['sheep', 'boar']))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 2 } },
    })

    response = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 0, crop: 'grain' },
      { row: 0, col: 1, crop: 'grain' },
    ] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 3 }], [{ kind: 'grain', remaining: 3 }],
    ])
  })

  it('D115 S3: one kept newborn limits sowing to one field', () => {
    const session = setup()
    session.performRoundEnd()
    let response = enterSow(session, arrange(session, ['sheep']))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 1 } },
    })

    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
  })

  it('D115 S4: the newborn-based sow may be declined', () => {
    const session = setup()
    session.performRoundEnd()
    const offered = arrange(session, ['sheep'])
    expect(offered.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow',
    })

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })

  it('D115 S5: a discarded newborn gives no Fodder Planter sow', () => {
    const session = setup()
    session.performRoundEnd()

    const response = arrange(session, [])

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })
})
describe("D115 command boundaries", () => {
  const PLANTER = 'D115_FodderPlanter'
  type FarmAnimal = 'sheep' | 'boar' | 'cattle'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup(card: string, configure: (state: GameState) => void = () => { }, players = 2) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = 4
        for (const p of state.players)
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        const p = state.players[0]!
        if (card === PLANTER)
          p.occupationPlayed = [card]
        else
          p.minorHand = [card]
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function nursery({ species = ['sheep'], grain = 3, vegetable = 0, stable = true, fields = 3, played = true }: {
    species?: FarmAnimal[]
    grain?: number
    vegetable?: number
    stable?: boolean
    fields?: number
    played?: boolean
  } = {}) {
    return setup(PLANTER, state => {
      const p = state.players[0]!
      if (!played) {
        p.occupationPlayed = []
        p.occupationHand = [PLANTER]
      }
      Object.assign(p.resources, { grain, vegetable, wood: 3 })
      p.fields = Array.from({ length: fields }, (_, i) => ({ row: 1, col: i + 1, stacks: [] }))
      p.fenceSegments = []
      species.forEach((animalType, i) => {
        const col = 1 + i * 2
        p.resources[animalType] = 2
        p.pastures.push({ id: animalType, tiles: [{ row: 0, col }], animalType, animalCount: 2 })
        if (stable)
          p.stableTiles.push({ row: 0, col })
        for (const edge of [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`])
          p.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })
      })
      if (!stable) {
        p.houseAnimals = { '2-0': 'cattle' }
        p.resources.cattle = 1
      }
    })
  }
  function breeding(s: GameSession) {
    for (const p of s.state.players)
      markAllWorkersUsed(s.state, p)
    const r = ok(s.performRoundEnd())
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    return r
  }
  function arrange(s: GameSession, sheep = 3, boar = 0, houseCattle = false) {
    const zones = [{ id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep }]
    if (boar)
      zones.push({ id: 'boar', zoneType: 'pasture', animalType: 'boar', animalCount: boar })
    if (houseCattle)
      zones.push({ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 })
    return ok(s.resolveChoice(0, 'confirm', { zones }))
  }
  function sowMenu(s: GameSession, r: SessionResponse, max: number) {
    assert(r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionFodderPlanterSow')
    const take = options(r).find(o => o.value !== '__skip__')
    assert(take)
    r = ok(s.resolveChoice(0, take.value))
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
    assert.equal(r.interaction.request.farm.maxSelections, max)
    return r
  }
  it("actual first occupation play grants no work-phase crop or second activation", () => {
    const s = nursery({ played: false, species: [] })
    let r = ok(s.takeAction(0, 'lessons'))
    if (!r.state.players[0]!.occupationPlayed.includes(PLANTER)) {
      assert(options(r).some(o => o.value === PLANTER))
      r = ok(s.resolveChoice(0, PLANTER))
    }
    assert(r.state.players[0]!.occupationPlayed.includes(PLANTER))
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.players[0]!.resources.grain, 3)
    assert(r.state.players[0]!.fields.every(f => !f.stacks.length))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, PLANTER))
  })
  it("one housed newborn rejects excess fields noncrops and missing vegetables before legal sow", () => {
    const s = nursery()
    breeding(s)
    sowMenu(s, arrange(s), 1)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }, { row: 1, col: 2, crop: 'grain' }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'wood' }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'vegetable' }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 0, crop: 'grain' }] }))
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }] }))
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 3 }], [], []])
  })
  it("two newborns reject a third field before mixed crop sow", () => {
    const s = nursery({ species: ['sheep', 'boar'], grain: 2, vegetable: 1 })
    breeding(s)
    sowMenu(s, arrange(s, 3, 3), 2)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }, { row: 1, col: 2, crop: 'grain' }, { row: 1, col: 3, crop: 'vegetable' }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { crops: [{ row: 1, col: 1, crop: 'grain' }] }))
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }, { row: 1, col: 2, crop: 'vegetable' }] }))
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.vegetable, 0)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 3 }], [{ kind: 'vegetable', remaining: 2 }], []])
  })
  it("duplicate sow coordinates represent at most one field and one seed", () => {
    const s = nursery({ species: ['sheep', 'boar'], grain: 2 })
    breeding(s)
    sowMenu(s, arrange(s, 3, 3), 2)
    const r = s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }, { row: 1, col: 1, crop: 'grain' }] })
    ok(r)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 3 }], [], []])
  })
  it("no newborn no seed or no field never plants a crop", () => {
    const none = nursery({ species: [] })
    for (const p of none.state.players)
      markAllWorkersUsed(none.state, p)
    const noBirth = ok(none.performRoundEnd())
    assert.equal(noBirth.state.round, 5)
    assert.equal(noBirth.interaction.stateId, 'idle')
    for (const config of [{ grain: 0 }, { fields: 0 }]) {
      const s = nursery(config)
      breeding(s)
      const r = arrange(s)
      assert.equal(r.state.round, 5)
      assert.equal(r.interaction.stateId, 'idle')
      assert(r.state.players[0]!.fields.every(f => !f.stacks.length))
    }
  })
  it("a newborn without an accommodation slot grants no sow", () => {
    const s = nursery({ stable: false })
    breeding(s)
    const r = arrange(s, 2, 0, true)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    assert.equal(r.state.round, 5)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.players[0]!.resources.grain, 3)
  })
  it("decline preserves crops and stale work-phase sow is rejected", () => {
    const s = nursery()
    breeding(s)
    const offered = arrange(s)
    assert.equal(options(offered).some(o => o.value === '__skip__'), true)
    const r = ok(s.resolveChoice(0, '__skip__'))
    assert.equal(r.state.players[0]!.resources.grain, 3)
    assert(r.state.players[0]!.fields.every(f => !f.stacks.length))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }] }))
    assert.equal(r.state.round, 5)
  })
})

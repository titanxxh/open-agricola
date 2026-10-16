import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A086_AnimalTamer'
import '../../shared/cards/C/C134_CowPrince'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A086_AnimalTamer'
const COW_PRINCE_ID = 'C134_CowPrince'
const setup = ({ played = true, sheep = 0, boar = 0, }: {
  played?: boolean
  sheep?: number
  boar?: number
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 86, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, wood: 0, grain: 0, sheep, boar, cattle: 0 }
  player.pastures = []
  player.stableTiles = []
  player.houseAnimals = {}
  for (const tile of player.roomTiles.slice(0, sheep))
    player.houseAnimals[`${tile.row}-${tile.col}`] = 'sheep'
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 0
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
  session.loadState(state)
  return session
}
const chooseGain = (session: GameSession, response: SessionResponse, resource: 'wood' | 'grain') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response).find(candidate => candidate.effectPreview?.kind === 'resourceExchange' && candidate.effectPreview.resourcesGained?.[resource] === 1)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}
const animalReorg = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return { ...response, interaction: { ...response.interaction, request: response.interaction.request } }
}
describe('A086 Animal Tamer parity', () => {
  it('A086 S1: playing Animal Tamer can grant one wood', () => {
    const session = setup({ played: false })

    const response = chooseGain(session, session.takeAction(0, 'lessons'), 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
  })
  it('A086 S2: playing Animal Tamer can grant one grain', () => {
    const session = setup({ played: false })

    const response = chooseGain(session, session.takeAction(0, 'lessons'), 'grain')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
  })
  it('A086 S3: the two-room house stores two sheep', () => {
    const session = setup()
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    const pending = animalReorg(session.takeAction(0, 'sheep-market'))
    const house = pending.interaction.request.zones.find((zone) => zone.zoneType === 'house')
    expect(house?.capacity).toBe(1)
    const response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        { id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(2)
  })
  it('A086 S4: without Animal Tamer the house holds only one animal total', () => {
    const session = setup({ played: false })
    session.state.players[0]!.occupationHand = ['__test_placeholder__']
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(session.state)
    animalReorg(session.takeAction(0, 'sheep-market'))
    const response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
  })
  it('A086 S5: duplicate assignments to the same room are rejected atomically', () => {
    const session = setup({ sheep: 1 })
    session.state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
    session.loadState(session.state)
    const pending = animalReorg(session.takeAction(0, 'pig-market'))
    const before = JSON.stringify({ state: pending.state, interaction: pending.interaction })
    const response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ] })
    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(JSON.stringify({ state: response.state, interaction: response.interaction })).toBe(before)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect((Object.values(response.state.players[0]!.houseAnimals)[0] ?? null)).toBe('sheep')
    expect(Object.values(response.state.players[0]!.houseAnimals).length).toBe(1)
    const retry = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })
  it('A086 S6: two cattle in two rooms score two Cow Prince bonus points', () => {
    const session = setup()
    session.state.round = 14
    session.state.players[0]!.occupationPlayed.push(COW_PRINCE_ID)
    session.state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 2
    session.loadState(session.state)
    animalReorg(session.takeAction(0, 'cattle-market'))
    const response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
        { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseAnimals: { '1-0': 'cattle', '2-0': 'cattle' } })
    expect(response.scores).toBeDefined()
    expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: COW_PRINCE_ID, score: 2 }))
  })
  it.each([
    { tiles: 1, cattle: 3, expected: 1 },
    { tiles: 2, cattle: 2, expected: 2 },
    { tiles: 3, cattle: 1, expected: 1 },
    { tiles: 2, cattle: 0, expected: 0 },
  ])('Cow Prince scores $expected cattle-holding farm spaces for $tiles pasture tiles and $cattle cattle', ({ tiles, cattle, expected }) => {
    const session = setup()
    const player = session.state.players[0]!
    player.occupationPlayed.push(COW_PRINCE_ID)
    player.pastures = [{
        id: 'cow-prince-pasture',
        tiles: Array.from({ length: tiles }, (_, col) => ({ row: 0, col: col + 1 })),
        animalType: cattle > 0 ? 'cattle' : null,
        animalCount: cattle
      }]
    player.stableTiles = [{ row: 0, col: 1 }]
    player.fenceSegments = [
      ...Array.from({ length: tiles }, (_, col) => `H-0-${col + 1}`),
      ...Array.from({ length: tiles }, (_, col) => `H-1-${col + 1}`),
      'V-0-1', `V-0-${tiles + 1}`,
    ].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    player.resources.cattle = cattle
    session.loadState(session.state)
    const scoreResponse = session.getState()
    expect(scoreResponse.scores).toBeDefined()
    const entries = scoreResponse.scores![0]!.categories
      .find((category) => category.key === 'cardBonusVp')?.entries ?? []
    const score = entries.find((entry) => entry.type === 'bonus' && entry.cardId === COW_PRINCE_ID)?.score ?? 0
    expect(score).toBe(expected)
  })
})
describe("A086 command boundaries", () => {
  const TAMER = 'A086_AnimalTamer'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function setup({ played = true, resources = {}, market = 2 }: {
    played?: boolean
    resources?: Partial<Resource>
    market?: number
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
          assert.equal(p.workers.length, 5)
          assert.equal(p.workers.filter(w => w.isActive).length, 2)
        }
        const p = state.players[0]!
        p.minorHand = ['__test_placeholder__']
        p.occupationHand = played ? ['__test_placeholder__'] : [TAMER, 'A125_Priest']
        p.occupationPlayed = played ? [TAMER] : []
        Object.assign(p.resources, resources)
        for (const [id, type, count] of [['sheep-market', 'sheep', market], ['pig-market', 'boar', 1], ['cattle-market', 'cattle', 1]] as const) {
          const space = state.actionSpaces.find(space => space.id === id)
          assert.ok(space)
          space.resources[type] = count
        }
        configure(state)
      } }))
    record('fixture', s.getState())
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    const selected = options(r).filter(option => predicate(option) && !option.disabled)
    assert.equal(selected.length, 1, JSON.stringify(r.interaction))
    const o = selected[0]
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value)))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space)))
  }
  function animalMenu(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    return r.interaction.request
  }
  function choiceOptions(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length
  }
  function tamer(options: Parameters<typeof setup>[0] = {}, configure: (state: GameState) => void = () => {
  }) {
    return setup(options, configure)
  }
  function playTamer(s: GameSession, type: 'wood' | 'grain' = 'wood') {
    let r = turn(s, 0, 'lessons')
    if (!r.state.players[0]!.occupationPlayed.includes(TAMER))
      r = record('play-Tamer', ok(s.resolveChoice(0, TAMER)))
    const choice = choiceOptions(r).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesGained?.[type] === 1)
    assert.ok(choice, JSON.stringify(r.interaction))
    r = record(`Tamer-${type}`, ok(s.resolveChoice(0, choice.value)))
    return { r, choice: choice.value }
  }
  function house(s: GameSession, r: SessionResponse, count: number, type: 'sheep' | 'boar' = 'sheep') {
    const q = animalMenu(r)
    const rooms = q.zones.filter(z => z.zoneType === 'house')
    assert.ok(rooms.length >= count)
    const zones = rooms.slice(0, count).map(z => ({ ...z, animalType: type, animalCount: 1 }))
    return record('Tamer-house', ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, 'confirm', { zones })))
  }
  it("real Lessons wood grain exclusive reward with stale replay", () => {
    for (const type of ['wood', 'grain'] as const) {
      const s = tamer({ played: false })
      const { r, choice } = playTamer(s, type)
      assert.deepEqual({ wood: r.state.players[0]!.resources.wood, grain: r.state.players[0]!.resources.grain }, type === 'wood' ? { wood: 1, grain: 0 } : { wood: 0, grain: 1 })
      assert.equal(gainCount(r, TAMER), 1)
      record('Tamer-stale-gain', assertRejectedUnchanged(s, () => s.resolveChoice(0, choice)))
      assert.equal(r.state.players[1]!.resources.wood, 0)
      assert.equal(r.state.players[1]!.resources.grain, 0)
    }
  })
  it("two rooms house exactly two sheep and reject overcapacity", () => {
    const s = tamer({ market: 3 })
    let r = turn(s, 0, 'sheep-market')
    const zone = animalMenu(r).zones.find(z => z.zoneType === 'house')
    assert.ok(zone)
    assert.equal(zone.capacity, 1)
    assert.equal(animalMenu(r).zones.filter(z => z.zoneType === 'house').length, 2)
    record('Tamer-overcapacity', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...zone, animalType: 'sheep', animalCount: 3 }] })))
    r = house(s, r, 2)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(countRoomAnimals(r.state.players[0]!), 2)
  })
  it("different species legally share distinct house rooms", () => {
    const s = tamer({}, state => {
      const p = state.players[0]!
      p.resources.sheep = 1
      p.houseAnimals = { '2-0': 'sheep' }
    })
    const r = turn(s, 0, 'pig-market')
    const rooms = animalMenu(r).zones.filter(z => z.zoneType === 'house')
    assert.equal(rooms.length, 2)
    const response = record('Tamer-mixed-house', ok(s.resolveChoice(0, 'confirm', { zones: rooms.map((z, index) => ({ ...z, animalType: index === 0 ? 'sheep' : 'boar', animalCount: 1 })) })))
    assert.equal(response.state.players[0]!.resources.sheep, 1)
    assert.equal(response.state.players[0]!.resources.boar, 1)
    assert.deepEqual(Object.values(response.state.players[0]!.houseAnimals).sort(), ['boar', 'sheep'])
  })
  it("actual third room admits third sheep independent of workers", () => {
    const s = tamer({ resources: { wood: 5, reed: 2 }, market: 3 })
    let r = turn(s, 0, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = choose(s, r, o => o.labelKey === 'actions.construct.name')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    r = record('Tamer-build-third-room', ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })))
    while (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === '__skip__'))
      r = record('skip-stables', ok(s.resolveChoice(0, '__skip__')))
    turn(s, 1, 'forest')
    r = house(s, turn(s, 0, 'sheep-market'), 3)
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.resources.sheep, 3)
    assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 2)
  })
  it("unplayed and opponent remain ordinary one animal house", () => {
    let s = tamer({ played: false })
    let r = turn(s, 0, 'sheep-market')
    const ordinary = animalMenu(r).zones.find(z => z.zoneType === 'house')
    assert.ok(ordinary)
    assert.equal(ordinary.capacity, 1)
    record('unplayed-house-overflow', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...ordinary, animalType: 'sheep', animalCount: 2 }] })))
    r = house(s, r, 1)
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    s = tamer()
    turn(s, 0, 'reed-bank')
    r = turn(s, 1, 'sheep-market')
    const other = animalMenu(r).zones.find(z => z.zoneType === 'house')
    assert.ok(other)
    assert.equal(other.capacity, 1)
    r = house(s, r, 1)
    assert.equal(r.state.players[1]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
  })
  it("bad house identity and duplicated slot reject before legal housing", () => {
    const s = tamer()
    let r = turn(s, 0, 'sheep-market')
    const zone = animalMenu(r).zones.find(z => z.zoneType === 'house')
    assert.ok(zone)
    record('Tamer-bad-zone', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...zone, id: 'house-other', animalType: 'sheep', animalCount: 2 }] })))
    record('Tamer-duplicate-zone', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ ...zone, animalType: 'sheep', animalCount: 1 }, { ...zone, animalType: 'sheep', animalCount: 1 }] })))
    r = house(s, r, 2)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
  })
  it("real Lessons and animal use undo strict projection with retry", () => {
    let s = tamer({ played: false })
    let before = undoRuleSnapshot(s.getState())
    playTamer(s)
    assertUndoRestored(before, record('Tamer-Lessons-undo', s.undoAction()))
    let r = playTamer(s).r
    assert.equal(r.state.players[0]!.resources.wood, 1)
    s = tamer()
    before = undoRuleSnapshot(s.getState())
    house(s, turn(s, 0, 'sheep-market'), 2)
    assertUndoRestored(before, record('Tamer-animal-undo', s.undoAction()))
    r = house(s, turn(s, 0, 'sheep-market'), 2)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
  })
})

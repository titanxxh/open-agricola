import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { setActiveWorkerCount, setWorkersAtHome, familySize, newbornCount } from '../../shared/domain/player'
import '../../shared/cards/A/A085_Homekeeper'
import assert from 'node:assert/strict'
import { type FenceSegment, type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A085_Homekeeper'
describe('A085_Homekeeper session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }
  const openWishChildren = (session: GameSession) => {
    const state = session.getState().state
    state.round = 2
    state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
      spaceId === 'wish-children' ? null : spaceId,
    )
    state.roundActionOrder[0] = 'wish-children'

    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!wishChildren) throw new Error('wish-children space missing')
    wishChildren.takenBy = []
  }
  it('grants +1 capacity in a clay house when one room is adjacent to both a field and a pasture', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 1, col: 1 }],
        animalType: null,
        animalCount: 0
      },
    ]
    player.rooms = player.roomTiles.length
    player.fenceSegments = player.pastures.flatMap(pasture => {
      expect(pasture.tiles).toHaveLength(1)
      const tile = pasture.tiles[0]!
      return [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    })
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })
  it('does not stack when two rooms both qualify', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'stone'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 2, col: 1 }]
    player.fields = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }].map(tile => ({ ...tile, stacks: [] }))
    player.pastures = [{ id: 'p1', tiles: [{ row: 1, col: 1 }], animalType: null, animalCount: 0 }]
    player.rooms = player.roomTiles.length
    player.fenceSegments = player.pastures.flatMap(pasture => {
      expect(pasture.tiles).toHaveLength(1)
      const tile = pasture.tiles[0]!
      return [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    })
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })
  it('does not grant capacity when field and pasture are adjacent to different rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 2, col: 1 }],
        animalType: null,
        animalCount: 0
      },
    ]
    player.rooms = player.roomTiles.length
    player.fenceSegments = player.pastures.flatMap(pasture => {
      expect(pasture.tiles).toHaveLength(1)
      const tile = pasture.tiles[0]!
      return [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    })
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
  })
  it('does not grant extra capacity in a wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 1, col: 1 }],
        animalType: null,
        animalCount: 0
      },
    ]
    player.rooms = player.roomTiles.length
    player.fenceSegments = player.pastures.flatMap(pasture => {
      expect(pasture.tiles).toHaveLength(1)
      const tile = pasture.tiles[0]!
      return [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    })
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
  })
  it('makes wish-children available through GameSession when rooms equal family size but Homekeeper adds one effective room', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    openWishChildren(session)
    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.rooms = 2
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 1, col: 1 }],
        animalType: null,
        animalCount: 0
      },
    ]
    player.rooms = player.roomTiles.length
    player.fenceSegments = player.pastures.flatMap(pasture => {
      expect(pasture.tiles).toHaveLength(1)
      const tile = pasture.tiles[0]!
      return [`H-${tile.row}-${tile.col}`, `H-${tile.row + 1}-${tile.col}`, `V-${tile.row}-${tile.col}`, `V-${tile.row}-${tile.col + 1}`]
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    })
    session.loadState(state)
    const loaded = session.getState()
    expect(loaded.ok).toBe(true)
    expect(loaded.interaction.stateId).toBe('idle')
    expect(loaded.actionAvailability?.['wish-children']).toBe(true)
    const resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
  })
})
describe("A085 command boundaries", () => {
  const HOME = 'A085_Homekeeper'
  const WAGE = 'B007_Wage'
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  const rooms = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }]
  type Options = {
    played?: boolean
    roomCount?: number
    people?: number
    house?: 'wood' | 'clay' | 'stone'
    round?: number
    resources?: Partial<Resource>
  }
  function setup({ played = true, roomCount = 2, people = 2, house = 'wood', round = 7, resources = {} }: Options = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        for (const p of state.players) {
          p.minorHand = [WAGE]
          p.occupationHand = ['A111_WallBuilder']
          Object.assign(p.resources, { food: 30, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        }
        const p = state.players[0]!
        p.occupationPlayed = played ? ["A085_Homekeeper"] : []
        p.occupationHand = played ? ['A111_WallBuilder'] : ["A085_Homekeeper", 'A111_WallBuilder']
        p.rooms = roomCount
        p.roomTiles = rooms.slice(0, roomCount).map(t => ({ ...t }))
        p.houseType = house
        setActiveWorkerCount(p, people)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.state.players)
      assert.equal(p.workers.length, 5)
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function finish(s: GameSession, r: SessionResponse, actor = 0) {
    for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) {
      const skips = getChoiceOptions(r).filter(o => o.value === '__skip__' || o.value === '__done__')
      assert.equal(skips.length, 1, JSON.stringify(r.interaction))
      const skip = skips[0]
      assert(skip, JSON.stringify(r.interaction))
      r = record('finish-optional', ok(s.resolveChoice(actor, skip.value)))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    return r
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return record(`take:${space}`, ok(s.takeAction(actor, space)))
  }
  function growth(s: GameSession) {
    return finish(s, turn(s, 0, 'wish-children'))
  }
  function values(r: SessionResponse) {
    const p = r.state.players[0]!
    return { rooms: p.rooms, family: familySize(p), newborns: newbornCount(p), wood: p.resources.wood, reed: p.resources.reed, grain: p.resources.grain, food: p.resources.food }
  }
  function geometry(state: GameState, field: {
    row: number
    col: number
  } | null = { row: 0, col: 0 }, pasture: {
    row: number
    col: number
  } | null = { row: 1, col: 1 }) {
    const p = state.players[0]!
    p.fields = field ? [{ ...field, stacks: [] }] : []
    if (!pasture)
      return
    const { row, col } = pasture
    p.fenceSegments = [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`].map(edge => ({ edge, type: 'fence' } satisfies FenceSegment))
    p.pastures = [{ id: 'p1', tiles: [{ ...pasture }], animalType: null, animalCount: 0 }]
  }
  function denyGrowth(s: GameSession) {
    record('rejected-growth', assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children')))
    assert.equal(newbornCount(s.state.players[0]!), 0)
    const retry = turn(s, 0, 'day-laborer')
    assert.equal(values(retry).food, 32)
    assert.ok(retry.interaction.stateId === 'wait' && retry.interaction.request.kind === 'confirm-next-player', JSON.stringify(retry.interaction))
  }
  it("clay room with orthogonal field and pasture permits a real third newborn", () => {
    const s = setup({ house: 'clay' }, geometry)
    const r = growth(s)
    assert.deepEqual(values(r), { rooms: 2, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 })
    assert(s.state.players[0]!.minorHand.includes(WAGE))
  })
  it("stone room has the same single extra capacity", () => {
    const s = setup({ house: 'stone' }, geometry)
    assert.equal(values(growth(s)).family, 3)
  })
  it("identical adjacency in a wooden house rejects room-required growth", () => denyGrowth(setup({}, geometry)))
  it("adjacent field without pasture rejects room-required growth", () => denyGrowth(setup({ house: 'clay' }, st => geometry(st, { row: 0, col: 0 }, null))))
  it("adjacent pasture without field rejects room-required growth", () => denyGrowth(setup({ house: 'clay' }, st => geometry(st, null))))
  it("field and pasture adjacent to different rooms do not combine", () => denyGrowth(setup({ house: 'clay' }, st => geometry(st, { row: 0, col: 0 }, { row: 2, col: 1 }))))
  it("diagonal field and distant pasture do not provide capacity", () => denyGrowth(setup({ house: 'clay' }, st => geometry(st, { row: 0, col: 1 }, { row: 1, col: 2 }))))
  it("Homekeeper still in hand provides no extra capacity", () => denyGrowth(setup({ played: false, house: 'clay' }, geometry)))
  function doubleRooms(state: GameState) {
    geometry(state)
    const p = state.players[0]!
    p.roomTiles = [rooms[0]!, rooms[1]!, rooms[3]!].map(t => ({ ...t }))
    p.fields = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }].map(t => ({ ...t, stacks: [] }))
  }
  it("two qualifying rooms grant only one extra place with a fifth farmer still reserved", () => {
    const s = setup({ roomCount: 3, people: 4, house: 'clay' }, doubleRooms)
    assert.equal(s.state.players[0]!.workers.filter(w => !w.isActive).length, 1)
    denyGrowth(s)
    assert.equal(familySize(s.state.players[0]!), 4)
  })
  it("two qualifying rooms allow the single fourth person", () => {
    const s = setup({ roomCount: 3, people: 3, house: 'clay' }, doubleRooms)
    assert.equal(values(growth(s)).family, 4)
  })
  it("actual whole growth undo restores all farmers and permits one retry", () => {
    const s = setup({ house: 'clay' }, geometry)
    const before = undoRuleSnapshot(s.getState())
    growth(s)
    assertUndoRestored(before, record('undo-homekeeper', s.undoAction()))
    assert.equal(values(growth(s)).family, 3)
  })
  function lesson(s: GameSession, card: string) {
    const r = turn(s, 0, 'lessons')
    const found = options(r).find(o => o.value === card)
    assert(found, JSON.stringify(r.interaction))
    return record('play-occupation', ok(s.resolveChoice(0, found.value)))
  }
  it("actual first Lesson is free and only later room growth uses Homekeeper", () => {
    const s = setup({ played: false, house: 'clay', resources: { food: 1 } }, geometry)
    const played = lesson(s, HOME)
    assert.equal(values(played).food, 1)
    assert.equal(values(played).family, 2)
    turn(s, 1, 'forest')
    assert.equal(values(growth(s)).family, 3)
  })
  it("actual later Lesson pays one food without immediate growth", () => {
    const s = setup({ played: false, house: 'clay', resources: { food: 1 } }, st => {
      geometry(st)
      st.players[0]!.occupationPlayed = ['A111_WallBuilder']
      st.players[0]!.occupationHand = [HOME, 'A125_Priest']
    })
    const played = lesson(s, HOME)
    assert.equal(values(played).food, 0)
    assert.equal(values(played).family, 2)
    turn(s, 1, 'forest')
    assert.equal(values(growth(s)).family, 3)
  })
})

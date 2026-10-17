import { describe, expect, it, afterAll, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'

import { setActiveWorkerCount, setWorkersAtHome, familySize, newbornCount } from '../../shared/domain/player'
import '../../shared/cards/A/A085_Homekeeper'
import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11Growth from './_helpers/audit/ae-negative-11-growth'

const CARD_ID = 'A085_Homekeeper'

describe('A085_Homekeeper session', () => {
  const setup = () => {
    const session = new GameSession(42)
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
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('does not stack when two rooms both qualify', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'stone'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [
      { row: 0, col: 1, stacks: [] },
      { row: 2, col: 3, stacks: [] },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'p2',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('does not grant capacity when field and pasture are adjacent to different rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
  })

  it('does not grant extra capacity in a wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'wood'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 0, col: 0 }]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

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
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

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

describe('ae-negative-11-growth', () => {
  const { HOME, WAGE, sessions, directory, evidence, record, setup, turn, growth, values, geometry, denyGrowth, doubleRooms, lesson } = audit11Growth
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A085 N1 clay room with orthogonal field and pasture permits a real third newborn', () => { const s = setup(HOME, { house: 'clay' }, geometry); const r = growth(s); assert.deepEqual(values(r), { rooms: 2, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 }); assert(s.state.players[0]!.minorHand.includes(WAGE)) })
  it('A085 N2 stone room has the same single extra capacity', () => { const s = setup(HOME, { house: 'stone' }, geometry); assert.equal(values(growth(s)).family, 3) })
  it('A085 N3 identical adjacency in a wooden house rejects room-required growth', () => denyGrowth(setup(HOME, {}, geometry)))
  it('A085 N4 adjacent field without pasture rejects room-required growth', () => denyGrowth(setup(HOME, { house: 'clay' }, st => geometry(st, { row: 0, col: 0 }, null))))
  it('A085 N5 adjacent pasture without field rejects room-required growth', () => denyGrowth(setup(HOME, { house: 'clay' }, st => geometry(st, null))))
  it('A085 N6 field and pasture adjacent to different rooms do not combine', () => denyGrowth(setup(HOME, { house: 'clay' }, st => geometry(st, { row: 0, col: 0 }, { row: 2, col: 1 }))))
  it('A085 N7 diagonal field and distant pasture do not provide capacity', () => denyGrowth(setup(HOME, { house: 'clay' }, st => geometry(st, { row: 0, col: 1 }, { row: 1, col: 2 }))))
  it('A085 N8 Homekeeper still in hand provides no extra capacity', () => denyGrowth(setup(HOME, { played: false, house: 'clay' }, geometry)))
  it('A085 N9 two qualifying rooms grant only one extra place with a fifth farmer still reserved', () => { const s = setup(HOME, { roomCount: 3, people: 4, house: 'clay' }, doubleRooms); assert.equal(s.state.players[0]!.workers.filter(w => !w.isActive).length, 1); denyGrowth(s); assert.equal(familySize(s.state.players[0]!), 4) })
  it('A085 N10 two qualifying rooms allow the single fourth person', () => { const s = setup(HOME, { roomCount: 3, people: 3, house: 'clay' }, doubleRooms); assert.equal(values(growth(s)).family, 4) })
  it('A085 N11 actual whole growth undo restores all farmers and permits one retry', () => { const s = setup(HOME, { house: 'clay' }, geometry); const before = undoRuleSnapshot(s.getState()); growth(s); assertUndoRestored(before, record('undo-homekeeper', s.undoAction())); assert.equal(values(growth(s)).family, 3) })
  it('A085 N12 actual first Lesson is free and only later room growth uses Homekeeper', () => {
    const s = setup(HOME, { played: false, house: 'clay', resources: { food: 1 } }, geometry)
    const played = lesson(s, HOME); assert.equal(values(played).food, 1); assert.equal(values(played).family, 2)
    turn(s, 1, 'forest'); assert.equal(values(growth(s)).family, 3)
  })
  it('A085 N13 actual later Lesson pays one food without immediate growth', () => {
    const s = setup(HOME, { played: false, house: 'clay', resources: { food: 1 } }, st => { geometry(st); st.players[0]!.occupationPlayed = ['A111_WallBuilder']; st.players[0]!.occupationHand = [HOME, 'A125_Priest'] })
    const played = lesson(s, HOME); assert.equal(values(played).food, 0); assert.equal(values(played).family, 2)
    turn(s, 1, 'forest'); assert.equal(values(growth(s)).family, 3)
  })
})

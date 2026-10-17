import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { A014_CarpentersHammer } from '../../shared/cards/A/A014_CarpentersHammer'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from './_helpers/audit-evidence-fs'
import type { PlayerState } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Building from './_helpers/audit/ae-negative-05-building'

const CARD_ID = 'A014_CarpentersHammer'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  houseType = 'wood' as 'wood' | 'clay' | 'stone',
  resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6014, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.activeModifiers = played ? [...(A014_CarpentersHammer.impl.modifiers ?? [])] : []
  player.houseType = houseType
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const buildRooms = (session: GameSession, count: number) => {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.farm?.farmType !== 'room') {
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm?.farmType).toBe('room')
  const rooms = response.interaction.request.farm?.selectableTiles.slice(0, count) ?? []
  expect(rooms).toHaveLength(count)
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms })
}

describe("A014 Carpenter's Hammer parity", () => {
  it("A014 S1: paying one wood plays Carpenter's Hammer", () => {
    const response = playCard(setup({ played: false, resources: { wood: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.activeModifiers.filter((modifier) => modifier.cardId === CARD_ID)).toHaveLength(4)
  })

  it('A014 S2: building two wood rooms receives the total two wood and two reed discount', () => {
    const response = buildRooms(setup({ resources: { wood: 8, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 4, resources: { wood: 0, reed: 0 },
    })
  })

  it('A014 S3: building two clay rooms receives the total three clay and two reed discount', () => {
    const response = buildRooms(setup({ houseType: 'clay', resources: { clay: 7, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 4, resources: { clay: 0, reed: 0 },
    })
  })

  it('A014 S4: building two stone rooms receives the total four stone and two reed discount', () => {
    const response = buildRooms(setup({ houseType: 'stone', resources: { stone: 6, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', rooms: 4, resources: { stone: 0, reed: 0 },
    })
  })

  it('A014 S5: building only one room pays the undiscounted room cost', () => {
    const response = buildRooms(setup({ resources: { wood: 5, reed: 2 } }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { wood: 0, reed: 0 },
    })
  })
})

describe('ae-negative-05-building', () => {
  const { A014, sessions, pair, setup, ok, opts, turn, buy, deniedCard, farm, build, finish } = audit05Building
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A014 N1 zero wood forged purchase rejects and one wood installs discount', () => {
    deniedCard(setup({ card: A014 }), A014)
    const s = setup({ card: A014, resources: { wood: 1 } }); const r = buy(s, A014)
    assert.ok(r.state.players[0]!.minorPlayed.includes(A014)); assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it('A014 N2 three rooms get one total wood clay or stone discount', () => {
    for (const [house, resource, amount] of [['wood', 'wood', 13], ['clay', 'clay', 12], ['stone', 'stone', 11]] satisfies [PlayerState['houseType'], 'wood' | 'clay' | 'stone', number][]) {
      const s = setup({ card: A014, played: true, house, resources: { [resource]: amount, reed: 4 } })
      const r = build(s, [...pair, { row: 0, col: 1 }])
      assert.equal(r.state.players[0]!.rooms, 5); assert.equal(r.state.players[0]!.resources[resource], 0); assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.equal(r.scores?.length, 2)
    }
  })
  it('A014 N3 two-room material shortage rejects then one full-price room succeeds', () => {
    const s = setup({ card: A014, played: true, resources: { wood: 7, reed: 2 } }); farm(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: pair }))
    const r = ok(s.commitSelectionChoice(0, { rooms: [pair[0]!] }))
    assert.equal(r.state.players[0]!.rooms, 3); assert.equal(r.state.players[0]!.resources.wood, 2); assert.equal(r.state.players[0]!.resources.reed, 0)
  })
  it('A014 N4 two-room reed shortage rejects without borrowing total discount twice', () => {
    const s = setup({ card: A014, played: true, resources: { wood: 8, reed: 1 } })
    const r = s.takeAction(0, 'farm-expansion'); ok(r)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room') assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: pair }))
    else { assert.equal(opts(r).some(o => o.labelKey === 'actions.construct.name' && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'construct')) }
    assert.equal(s.getState().state.players[0]!.rooms, 2); assert.equal(s.getState().state.players[0]!.resources.reed, 1)
    s.undoAction(); farm(s, 0, 'stable'); const done = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })); assert.equal(done.state.players[0]!.resources.wood, 6)
  })
  it('A014 N5 occupied disconnected and duplicate room plans reject before legal pair', () => {
    const s = setup({ card: A014, played: true, resources: { wood: 8, reed: 2 } }); farm(s)
    for (const rooms of [[{ row: 1, col: 0 }, pair[0]!], [{ row: 0, col: 4 }, { row: 1, col: 4 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms }))
    const r = ok(s.commitSelectionChoice(0, { rooms: pair })); assert.equal(r.state.players[0]!.rooms, 4); assert.equal(r.state.players[0]!.resources.wood, 0)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: pair }))
    const duplicate = setup({ card: A014, played: true, resources: { wood: 8, reed: 2 } }); const undoBefore = undoRuleSnapshot(duplicate.getState()); farm(duplicate)
    const before = undoRuleSnapshot(duplicate.getState())
    const payload = { rooms: [pair[0]!, pair[0]!] }
    const actual = duplicate.commitSelectionChoice(0, payload)
    mkdirSync('output/ae-negative/building-oa-artifacts', { recursive: true })
    writeFileSync('output/ae-negative/building-oa-artifacts/A014-N5-duplicate.json', JSON.stringify({ command: 'commitSelectionChoice', actor: 0, payload, response: actual }, null, 2))
    const outcome = { accepted: actual.ok, rooms: actual.state.players[0]!.rooms, uniqueRooms: new Set(actual.state.players[0]!.roomTiles.map(t => `${t.row}_${t.col}`)).size, wood: actual.state.players[0]!.resources.wood, reed: actual.state.players[0]!.resources.reed }
    if (!actual.ok) assert.equal(undoRuleSnapshot(actual), before)
    assertUndoRestored(undoBefore, duplicate.undoAction())
    assertRuleOutcome(outcome, { accepted: false, rooms: 2, uniqueRooms: 2, wood: 8, reed: 2 })
  })
  it('A014 N6 stable alone and opponent rooms receive no hammer discount', () => {
    const stable = setup({ card: A014, played: true, resources: { wood: 2 } }); farm(stable, 0, 'stable')
    const stableResult = finish(stable, ok(stable.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })))
    assert.equal(stableResult.state.players[0]!.resources.wood, 0); assert.equal(stableResult.state.players[0]!.stableTiles.length, 1)
    const s = setup({ card: A014, played: true, opponent: { wood: 10, reed: 4 } }); turn(s, 0, 'grain-seeds')
    const r = build(s, pair, 1)
    assert.equal(r.state.players[0]!.rooms, 2)
    assert.equal(r.state.players[1]!.resources.wood, 0); assert.equal(r.state.players[1]!.resources.reed, 0); assert.equal(r.state.players[1]!.rooms, 4)
  })
  it('A014 N7 undo removes rooms and restores discount resources before legal replay', () => {
    const s = setup({ card: A014, played: true, resources: { wood: 8, reed: 2 } }); const before = undoRuleSnapshot(s.getState())
    build(s); assertUndoRestored(before, s.undoAction()); const r = build(s)
    assert.equal(r.state.players[0]!.rooms, 4); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0)
  })
})

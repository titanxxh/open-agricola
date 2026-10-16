import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A167_BreederBuyer'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions , expectTileFarmSelection , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A167_BreederBuyer'

const FILLER = '__test_placeholder__'

const setup = ({
  houseType = 'wood', played = true, resources = {},
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  played?: boolean
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6167, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    player.houseAnimals = {};
    player.pastures = []
    player.stableAnimals = {}
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  Object.assign(owner.resources, resources)
  const farmExpansion = state.actionSpaces.find((space) => space.id === 'farm-expansion')
  if (!farmExpansion) throw new Error('farm-expansion missing')
  farmExpansion.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const chooseMode = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const requestedFarmType = labelKey === 'actions.construct.name' ? 'room' : 'stable'
  if (response.interaction.request.kind === 'farm-select'
    && response.interaction.request.farm.farmType === requestedFarmType) {
    return response
  }
  const option = getChoiceOptions(response)?.find((candidate) =>
    candidate.labelKey === labelKey
      || (requestedFarmType === 'stable' && candidate.labelKey === 'actions.stables.name'))
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildRoomsAndStables = (session: GameSession, roomCount = 1, stableCount = 1) => {
  let response = chooseMode(session, session.takeAction(0, 'farm-expansion'), 'actions.construct.name')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  const rooms = expectTileFarmSelection(response, 'room').selectableTiles.slice(0, roomCount)
  response = session.commitSelectionChoice(0, { rooms })
  response = chooseMode(session, response, 'actions.buildStables.name')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  const stables = expectTileFarmSelection(response, 'stable').selectableTiles.slice(0, stableCount)
  return session.commitSelectionChoice(0, { stables })
}

describe('A167 Breeder Buyer parity', () => {
  it('A167 S1: Breeder Buyer is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it.each([
    { scenario: 'S2', houseType: 'wood', resources: { wood: 7, reed: 2 }, animal: 'sheep' },
    { scenario: 'S3', houseType: 'clay', resources: { wood: 2, clay: 5, reed: 2 }, animal: 'boar' },
    { scenario: 'S4', houseType: 'stone', resources: { wood: 2, stone: 5, reed: 2 }, animal: 'cattle' },
  ] as const)('A167 $scenario: building a $houseType room and stable together gains one $animal',
    ({ houseType, resources, animal }) => {
      const response = buildRoomsAndStables(setup({ houseType, resources }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[animal]).toBe(1)
    })

  it('A167 S5: building only a room or only a stable grants no animal', () => {
    const roomSession = setup({ resources: { wood: 5, reed: 2 } })
    let roomOnly = chooseMode(
      roomSession, roomSession.takeAction(0, 'farm-expansion'), 'actions.construct.name',
    )
    if (roomOnly.interaction.stateId === 'wait'
      && roomOnly.interaction.request.kind === 'farm-select') {
      const room = expectTileFarmSelection(roomOnly, 'room').selectableTiles[0]!
      roomOnly = roomSession.commitSelectionChoice(0, { rooms: [room] })
    }
    expect(roomOnly.state.players[0]!.resources.sheep).toBe(0)

    const stableSession = setup({ resources: { wood: 2 } })
    let stableOnly = chooseMode(
      stableSession, stableSession.takeAction(0, 'farm-expansion'), 'actions.buildStables.name',
    )
    if (stableOnly.interaction.stateId === 'wait'
      && stableOnly.interaction.request.kind === 'farm-select') {
      const stable = expectTileFarmSelection(stableOnly, 'stable').selectableTiles[0]!
      stableOnly = stableSession.commitSelectionChoice(0, { stables: [stable] })
    }
    expect(stableOnly.state.players[0]!.resources.sheep).toBe(0)
  })

  it('A167 S6: multiple rooms and stables in one action still grant only one animal', () => {
    const response = buildRoomsAndStables(setup({ resources: { wood: 14, reed: 4 } }), 2, 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})

describe("A167 command boundaries", () => {
  const CARD = 'A167_BreederBuyer'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 4 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CARD] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
  }
  function build(s: GameSession, r: SessionResponse, first: 'room' | 'stable', counts = { room: 1, stable: 1 }) {
    const remaining = { ...counts }
    for (let n = 0; n < 20 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else if (i.request.kind === 'farm-select') {
        const kind = i.request.farm.farmType
        assert.ok(kind === 'room' || kind === 'stable')
        if (kind === 'room')
          r = ok(s.commitSelectionChoice(i.playerIndex, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, remaining.room) }))
        else
          r = ok(s.commitSelectionChoice(i.playerIndex, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }].slice(0, remaining.stable) }))
        remaining[kind] = 0
      }
      else {
        assert.ok(i.request.kind === 'choice', JSON.stringify(i))
        const kind = remaining[first] ? first : remaining.room ? 'room' : remaining.stable ? 'stable' : null
        const label = kind === 'room' ? 'actions.construct.name' : 'actions.stables.name'
        const o = i.request.options.find(o => kind ? o.labelKey === label : o.value === '__skip__' || o.value === '__done__') ?? i.request.options.find(o => o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
    }
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function farm(type: 'wood' | 'clay' | 'stone', played = true, counts = { room: 1, stable: 1 }) {
    return setup(state => {
      const p = state.players[0]!
      p.houseType = type
      Object.assign(p.resources, { wood: 2 * counts.stable + (type === 'wood' ? 5 * counts.room : 0), clay: type === 'clay' ? 5 * counts.room : 0, stone: type === 'stone' ? 5 * counts.room : 0, reed: 2 * counts.room })
    }, played)
  }
  it("one actual room and stable together give one matching house material animal in either order", () => {
    for (const [type, animal] of [['wood', 'sheep'], ['clay', 'boar'], ['stone', 'cattle']] as const)
      for (const first of ['room', 'stable'] as const) {
        const s = farm(type)
        const pending = turn(s, 0, 'farm-expansion'), r = build(s, pending, first)
        assert.equal(r.state.players[0]!.rooms, 3)
        assert.equal(r.state.players[0]!.stableTiles.length, 1)
        assert.equal(r.state.players[0]!.resources[animal], 1)
        for (const other of ['sheep', 'boar', 'cattle'] as const)
          if (other !== animal)
            assert.equal(r.state.players[0]!.resources[other], 0)
        assert.equal(r.state.players[0]!.resources.wood, 0)
        assert.equal(r.state.players[0]!.resources[type], 0)
        assert.equal(r.state.players[0]!.resources.reed, 0)
        save(`A167-N1-${type}-${first}`, { pending, r })
      }
  })
  it("room only stable only and unplayed hand cannot give livestock", () => {
    for (const counts of [{ room: 1, stable: 0 }, { room: 0, stable: 1 }, { room: 1, stable: 1 }]) {
      const played = counts.room + counts.stable < 2
      const s = farm('wood', played, counts)
      const r = build(s, turn(s, 0, 'farm-expansion'), counts.room ? 'room' : 'stable', counts)
      assert.equal(r.state.players[0]!.resources.sheep, 0)
      assert.equal(r.state.players[0]!.resources.boar, 0)
      assert.equal(r.state.players[0]!.resources.cattle, 0)
      save(`A167-N2-${counts.room}-${counts.stable}`, r)
    }
  })
  it("multiple real rooms and stables in one action grant only one livestock", () => {
    const counts = { room: 2, stable: 2 }
    const s = farm('wood', true, counts)
    const r = build(s, turn(s, 0, 'farm-expansion'), 'room', counts)
    assert.equal(r.state.players[0]!.rooms, 4)
    assert.equal(r.state.players[0]!.stableTiles.length, 2)
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    save('A167-N3', r)
  })
  it("wrong actor illegal room and stale requests cannot grant free or duplicate livestock", () => {
    const s = farm('wood')
    let r = turn(s, 0, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 99, col: 99 }] }))
    const done = build(s, r, 'room')
    assert.equal(done.state.players[0]!.resources.sheep, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'build-again'))
    save('A167-N4', { r, done })
  })
  it("whole construction undo restores animal payment and finite structures before retry", () => {
    const s = farm('wood')
    const r = build(s, turn(s, 0, 'farm-expansion'), 'room')
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.rooms, 2)
    assert.equal(undone.state.players[0]!.stableTiles.length, 0)
    assert.equal(undone.state.players[0]!.resources.sheep, 0)
    assert.equal(undone.state.players[0]!.resources.wood, 7)
    assert.equal(undone.state.players[0]!.resources.reed, 2)
    const retry = build(s, turn(s, 0, 'farm-expansion'), 'stable')
    assert.equal(retry.state.players[0]!.resources.sheep, 1)
    save('A167-N5', { r, undone, retry })
  })
})

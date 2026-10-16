import { expectWait } from './_helpers/trigger-select'
import { expectTileFarmSelection } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A090_PlowDriver'
import '../../shared/cards/A/A091_ShiftingCultivator'
import '../../shared/cards/A/A101_CookeryOutfitter'
import '../../shared/cards/A/A133_Braggart'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []
const setup = ({ cardId, played = true, playerCount = 2, round = 5, resources = {}, }: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  resources?: Record<string, number>
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7090 + round, options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}
const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait' && response.state.players[0]!.occupationHand.includes(cardId)) {
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, card!.value)
  }
  return response
}
const bonusScore = (response: SessionResponse, cardId: string) => {
  assert.ok(response.scores)
  return response.scores[0]!.categories.find(category => category.key === 'cardBonusVp')?.entries
    .find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0
}
const commitPlow = (session: GameSession, response: SessionResponse) => {
  const wait = expectWait(response)
  const tile = expectTileFarmSelection(wait, 'plow').selectableTiles[0]
  expect(tile).toBeDefined()
  return session.commitSelectionChoice(wait.interaction.playerIndex, { tile: tile! })
}
describe('A090 Plow Driver parity', () => {
  const CARD_ID = 'A090_PlowDriver'
  it('A090 S1: Plow Driver is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })
  const startRound = (houseType: 'wood' | 'clay' | 'stone', food: number) => {
    const session = setup({ cardId: CARD_ID, resources: { food } })
    const state = session.getState().state
    state.players[0]!.houseType = houseType
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players.forEach((player) => { player.resources.food = player === state.players[0] ? food : 20 })
    session.loadState(state)
    return { session, response: session.performRoundEnd() }
  }
  it('A090 S2: at round start a stone-house owner may pay one food to plow one field', () => {
    const { session } = startRound('stone', 1)
    let response = session.getState()
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
    response = commitPlow(session, response)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })
  it('A090 S3: the Plow Driver round-start plow may be declined', () => {
    const { session, response: initial } = startRound('stone', 1)
    const response = session.resolveChoice(expectWait(initial).interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })
  it('A090 S4: a non-stone house receives no Plow Driver offer', () => {
    const { response } = startRound('clay', 1)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })
  it('A090 S5: a stone-house owner without food receives no Plow Driver offer in OA', () => {
    const { response } = startRound('stone', 0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })
})
describe('A091 Shifting Cultivator parity', () => {
  const CARD_ID = 'A091_ShiftingCultivator'
  it('A091 S1: Shifting Cultivator is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })
  const collect = (food: number, spaceId = 'forest') => {
    const session = setup({ cardId: CARD_ID, resources: { food } })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)
    return { session, response: session.takeAction(0, spaceId) }
  }
  it('A091 S2: before collecting Forest wood, three food may buy one plow', () => {
    const { session, response: initial } = collect(3)
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    response = commitPlow(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })
  it('A091 S3: declining Shifting Cultivator preserves food and still collects wood', () => {
    const { session, response: initial } = collect(3)
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 3 })
  })
  it('A091 S4: fewer than three food silently skips Shifting Cultivator in OA', () => {
    const { response } = collect(2)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 3 })
  })
  it('A091 S5: a non-wood accumulation offers no Shifting Cultivator plow', () => {
    const { response } = collect(3, 'clay-pit')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(3)
  })
})
describe('A101 Cookery Outfitter parity', () => {
  const CARD_ID = 'A101_CookeryOutfitter'

  it('A101 S1: Cookery Outfitter is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A101 S2: cooking improvements score while ovens do not', () => {
    const session = setup({ cardId: CARD_ID, round: 14 })
    const state = session.getState().state
    state.players[0]!.improvements = [
      'Major_Fireplace1', 'Major_CookingHearth1', 'Major_ClayOven', 'Major_StoneOven',
    ]
    session.loadState(state)
    expect(bonusScore(session.getState(), CARD_ID)).toBe(2)
  })
})
describe('A133 Braggart parity', () => {
  const CARD_ID = 'A133_Braggart'
  const improvements = [
    'Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2',
    'Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket', 'Major_Well',
  ]

  it('A133 S1: Braggart is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 3 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A133 S2: Braggart scores the printed improvement-count thresholds', () => {
    for (const [count, expected] of [[4, 0], [5, 2], [6, 3], [7, 4], [8, 5], [9, 7], [10, 9]]) {
      const session = setup({ cardId: CARD_ID, playerCount: 3, round: 14 })
      const state = session.getState().state
      state.players[0]!.improvements = improvements.slice(0, count)
      session.loadState(state)
      expect(bonusScore(session.getState(), CARD_ID), `count=${count}`).toBe(expected)
    }
  })
})
describe("A090 command boundaries", () => {
  const DRIVER = 'A090_PlowDriver'
  function artifact(name: string, data: object) {
    sessionEvidence.record(name, data)
  }
  type Setup = {
    played?: boolean
    round?: number
    house?: PlayerState['houseType']
    rooms?: number
    resources?: Partial<PlayerState['resources']>
    occupations?: number
    opponent?: boolean
    configure?: (state: GameState) => void
  }
  function setup({ played = true, round = 6, house = 'wood', rooms = 2, resources = {}, occupations = 0, opponent = false, configure = () => {
  } }: Setup = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.houseType = house
        p.rooms = rooms
        p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...Array.from({ length: rooms - 2 }, (_, n) => ({ row: 2, col: n + 1 }))]
        p.occupationPlayed = ['A116_WoodCutter'].slice(0, occupations)
        if (played && !opponent)
          p.occupationPlayed.push("A090_PlowDriver")
        else
          p.occupationHand.push("A090_PlowDriver")
        if (opponent)
          state.players[1]!.occupationPlayed = ["A090_PlowDriver"]
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    assert.equal(s.getState().state.players.length, 2)
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.stableTiles.length, 0)
      assert.ok(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)) >= 0)
      if (p.fenceSegments.length)
        s.withCtx(() => assert.equal(getOwnOrdinaryFenceReserveCount(p), 15 - p.fenceSegments.length))
    }
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function res(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const r = ok(s.takeAction(actor, space))
    assert.ok(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id))
    artifact('place', { space, actor, response: r })
    return r
  }
  function complete(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return r
  }
  function lessons(s: GameSession, card: string) {
    let r = turn(s, 0, 'lessons')
    if (r.state.players[0]!.occupationHand.includes(card)) {
      assert.ok(opts(r).some(o => o.value === card && !o.disabled))
      r = ok(s.resolveChoice(0, card))
    }
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== 'cancel')!.value))
    assert.ok(r.state.players[0]!.occupationPlayed.includes(card))
    return complete(r)
  }
  function denyHost(s: GameSession, space: string) {
    assertRejectedUnchanged(s, () => s.takeAction(0, space))
    complete(turn(s, 0, 'day-laborer'))
    return { hostRejected: true, legalRetryCompleted: true }
  }
  function fields(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.fields.length
  }
  function workEnd(s: GameSession) {
    turn(s, 0, 'forest')
    turn(s, 1, 'grain-seeds')
    turn(s, 0, 'clay-pit')
    return confirmNext(s, turn(s, 1, 'reed-bank'))
  }
  function driverChoice(r: SessionResponse) {
    return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.sourceCard === DRIVER
  }
  function acceptDriver(s: GameSession, r: SessionResponse) {
    assert.equal(driverChoice(r), true, JSON.stringify(r.interaction))
    r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== '__skip__')!.value))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== 'cancel')!.value))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow', JSON.stringify(r.interaction))
    return r
  }
  function driverPlow(s: GameSession, r: SessionResponse, col = 1) {
    acceptDriver(s, r)
    return ok(s.commitSelectionChoice(0, { tile: { row: 0, col } }))
  }
  it("real first and later Lessons pay zero and one food without an immediate ability", () => {
    for (const prior of [0, 1]) {
      const s = setup({ played: false, occupations: prior, resources: { food: prior }, house: 'stone' })
      const r = lessons(s, DRIVER)
      assert.equal(res(r).food, 0)
      assert.equal(fields(r), 0)
      assert.equal(r.state.players[0]!.fenceSegments.length, 0)
    }
    return { firstFee: 0, laterFee: 1, immediateFields: 0, immediateFences: 0 }
  })
  it("missing the later Lessons food rejects a real forged entry before a legal action", () => {
    return denyHost(setup({ played: false, occupations: 1 }), 'lessons')
  })
  it("a natural stone house round start pays one food and plows exactly one field", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 1 } })
    const r = driverPlow(s, workEnd(s))
    assert.equal(r.state.round, 6)
    assert.equal(res(r).food, 0)
    assert.equal(fields(r), 1)
    assert.equal(r.interaction.stateId, 'idle')
    return { round: 6, foodPaid: 1, fields: 1 }
  })
  it("declining a natural round start preserves food and the unplowed farm", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 1 } })
    const r = workEnd(s)
    assert.equal(driverChoice(r), true)
    const end = ok(s.resolveChoice(0, '__skip__'))
    assert.equal(end.state.round, 6)
    assert.equal(res(end).food, 1)
    assert.equal(fields(end), 0)
    return { round: 6, declined: true, food: 1, fields: 0 }
  })
  it("wooden and clay houses cannot gain the stone house round start effect", () => {
    for (const house of ['wood', 'clay'] satisfies PlayerState['houseType'][]) {
      const s = setup({ round: 5, house, resources: { food: 1 } })
      const r = workEnd(s)
      assert.equal(driverChoice(r), false)
      assert.equal(fields(r), 0)
      assert.equal(res(r).food, 1)
    }
    return { nonStoneHouses: 2, food: 1, fields: 0 }
  })
  it("Plow Driver in hand cannot plow the owner stone farm at round start", () => {
    const s = setup({ round: 5, house: 'stone', played: false, resources: { food: 1 } })
    const r = workEnd(s)
    assert.equal(driverChoice(r), false)
    assert.equal(res(r).food, 1)
    assert.equal(fields(r), 0)
    return { food: 1, fields: 0, ownerTrigger: false }
  })
  it("only the opponent Plow Driver cannot plow the owner stone farm at round start", () => {
    const s = setup({ round: 5, house: 'stone', opponent: true, resources: { food: 1 } })
    const r = workEnd(s)
    assert.equal(driverChoice(r), false)
    assert.equal(res(r).food, 1)
    assert.equal(fields(r), 0)
    return { food: 1, fields: 0, ownerTrigger: false }
  })
  it("zero food at a natural round start cannot accept the paid plow effect", () => {
    const s = setup({ round: 5, house: 'stone' })
    const r = workEnd(s)
    assert.equal(driverChoice(r), false)
    assert.equal(res(r).food, 0)
    assert.equal(fields(r), 0)
    return { food: 0, fields: 0, acceptingChoice: false }
  })
  it("a full farm exposes current step admission without claiming completed plowing", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 1 }, configure(state) {
        state.players[0]!.fields = Array.from({ length: 15 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5, stacks: [] })).filter(t => !(t.col === 0 && t.row > 0))
      } })
    let r = workEnd(s)
    assert.equal(fields(r), 13)
    artifact('full-farm-before', { response: r })
    if (driverChoice(r))
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== '__skip__')!.value))
    artifact('full-farm-after', { response: r })
    assert.equal(fields(r), 13)
    assert.equal(res(r).food, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'engine-blocked' && r.interaction.request.actionId === 'plow')
    return { fields: 13, food: res(r).food, interaction: r.interaction, completedPlow: false, admissionScope: 'ADR0015 current step, future target feasibility not guaranteed' }
  })
  it("paid plowing rejects illegal tiles before one valid field without charging twice", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 1 }, configure(state) {
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
      } })
    let r = acceptDriver(s, workEnd(s))
    assert.equal(res(r).food, 0)
    for (const tile of [{ row: 1, col: 0 }, { row: 0, col: 1 }, { row: 3, col: 0 }])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile }))
    r = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }))
    assert.equal(res(r).food, 0)
    assert.equal(fields(r), 2)
    return { foodPaid: 1, illegalTargetsRejected: true, fields: 2 }
  })
  it("consecutive natural round starts charge once for each actual field", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 2 } })
    let r = driverPlow(s, workEnd(s))
    assert.equal(res(r).food, 1)
    assert.equal(fields(r), 1)
    r = driverPlow(s, workEnd(s), 2)
    assert.equal(r.state.round, 7)
    assert.equal(res(r).food, 0)
    assert.equal(fields(r), 2)
    return { round: 7, foodPaid: 2, fields: 2, roundActivations: 2 }
  })
  it("actual round start effect undo probes eligibility and retries only the available scope", () => {
    const s = setup({ round: 5, house: 'stone', resources: { food: 1 } })
    const initial = workEnd(s)
    const before = undoRuleSnapshot(initial)
    driverPlow(s, initial)
    const undone = s.undoStep()
    artifact('driver-undo', { before: JSON.parse(before), after: undone })
    if (!undone.ok) {
      assert.equal(undone.error, 'no history to undo')
      assert.equal(res(undone).food, 0)
      assert.equal(fields(undone), 1)
      return { restored: false, undoError: undone.error, food: 0, fields: 1, retryScope: 'no retry after unavailable undo' }
    }
    assert.deepEqual(JSON.parse(undoRuleSnapshot(undone)), JSON.parse(before))
    const retry = driverPlow(s, undone)
    assert.equal(res(retry).food, 0)
    assert.equal(fields(retry), 1)
    return { restored: true, food: 0, fields: 1, retryScope: 'restored effect scope' }
  })
  it("a stone opponent cannot use the wooden owner Plow Driver at a natural round start", () => {
    const s = setup({ round: 5, resources: { food: 1 }, configure(state) {
        state.players[1]!.houseType = 'stone'
        state.players[1]!.resources.food = 1
      } })
    const r = workEnd(s)
    assert.equal(driverChoice(r), false)
    assert.equal(fields(r), 0)
    assert.equal(fields(r, 1), 0)
    assert.equal(res(r).food, 1)
    assert.equal(res(r, 1).food, 1)
    return { round: 6, ownerFields: 0, opponentFields: 0, ownerFood: 1, opponentFood: 1 }
  })
})
describe("A091 command boundaries", () => {
  const CULT = 'A091_ShiftingCultivator'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, round = 5, resources = {}, occupations = 0 }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
    occupations?: number
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.occupationPlayed = ['A125_Priest', 'A111_WallBuilder', 'A124_Knapper'].slice(0, occupations)
        {
          p.minorPlayed = []
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = played ? ['__test_placeholder__'] : [CULT]
          if (played)
            p.occupationPlayed.push(CULT)
        }
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.fenceSegments.length, 0)
      assert.equal(p.stableTiles.length, 0)
    }
    return s
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function flow(s: GameSession, r: SessionResponse, card: string, accept = true) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      const request = r.interaction.request
      if (request.kind === 'select-trigger') {
        const o = request.options.find(o => o.value === card)
        assert.ok(o, JSON.stringify(r.interaction))
        r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
        continue
      }
      if (request.kind !== 'choice')
        break
      assert.equal(r.interaction.sourceCard, card)
      const selected = request.options.filter(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__' && !o.disabled)
      assert.equal(selected.length, 1, JSON.stringify(r.interaction))
      const o = selected[0]
      assert.ok(o, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    return r
  }
  function stock(state: GameState, space: string, resource: keyof Resource, amount: number) {
    state.actionSpaces.find(s => s.id === space)!.resources[resource] = amount
  }
  function cultivator({ played = true, food = 3, occupations = 0, round = 5 }: {
    played?: boolean
    food?: number
    occupations?: number
    round?: number
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    return setup({ played, round, occupations, resources: { food } }, state => {
      stock(state, 'forest', 'wood', 3)
      configure(state)
    })
  }
  function lesson(s: GameSession) {
    let r = turn(s, 0, 'lessons')
    if (r.state.players[0]!.occupationHand.includes(CULT))
      r = ok(s.resolveChoice(0, CULT))
    return r
  }
  function plow(s: GameSession, r: SessionResponse, tile = { row: 0, col: 1 }) {
    r = flow(s, r, CULT)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    return ok(s.commitSelectionChoice(0, { tile }))
  }
  function farm(state: GameState, count: number) {
    const cells = Array.from({ length: 15 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 })).filter(t => !(t.col === 0 && t.row > 0))
    state.players[0]!.fields = cells.slice(0, count).map(t => ({ ...t, stacks: [] }))
  }
  it("real first and later Lessons occupation fees follow the two player action space", () => {
    const first = lesson(cultivator({ played: false, food: 0 }))
    assert.ok(first.state.players[0]!.occupationPlayed.includes(CULT))
    assert.equal(first.state.players[0]!.resources.food, 0)
    const later = lesson(cultivator({ played: false, food: 1, occupations: 1 }))
    assert.ok(later.state.players[0]!.occupationPlayed.includes(CULT))
    assert.equal(later.state.players[0]!.resources.food, 0)
    const poor = cultivator({ played: false, food: 0, occupations: 1 })
    assertRejectedUnchanged(poor, () => poor.takeAction(0, 'lessons'))
    sessionEvidence.record('A091-N1-Lessons', { first, later, rejected: poor.getState() })
  })
  it("real Forest use pays three food for one field or declines and two food cannot pay", () => {
    const s = cultivator()
    const r = plow(s, turn(s, 0, 'forest'))
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.fields.length, 1)
    const d = cultivator()
    const declined = flow(d, turn(d, 0, 'forest'), CULT, false)
    assert.equal(declined.state.players[0]!.resources.food, 3)
    assert.equal(declined.state.players[0]!.resources.wood, 3)
    assert.equal(declined.state.players[0]!.fields.length, 0)
    const poor = cultivator({ food: 2 })
    const p = turn(poor, 0, 'forest')
    assert.equal(p.state.players[0]!.resources.food, 2)
    assert.equal(p.state.players[0]!.resources.wood, 3)
    assert.equal(p.state.players[0]!.fields.length, 0)
    sessionEvidence.record('A091-N2-accepted', r)
  })
  it("proper paid plow rejects room existing nonadjacent offboard wrong actor and duplicate targets", () => {
    const s = cultivator({}, state => state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }])
    const r = flow(s, turn(s, 0, 'forest'), CULT)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    for (const tile of [{ row: 1, col: 0 }, { row: 0, col: 1 }, { row: 2, col: 4 }, { row: 99, col: 99 }])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 0, col: 2 } }))
    const after = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }))
    assert.equal(after.state.players[0]!.fields.length, 2)
    assert.equal(after.state.players[0]!.resources.food, 0)
    assert.equal(after.state.players[0]!.resources.wood, 3)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }))
    sessionEvidence.record('A091-N3-legal', after)
  })
  it("accepted full farm payment blocks until whole undo and one empty cell permits the last plow", () => {
    const full = cultivator({}, state => farm(state, 13))
    const before = undoRuleSnapshot(full.getState())
    const pending = turn(full, 0, 'forest')
    sessionEvidence.record('A091-N4-full-farm-pending', pending)
    const offered = pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice' ? getChoiceOptions(pending).find(o => o.value !== '__skip__' && !o.disabled) : undefined
    const executed = offered ? full.resolveChoice(0, offered.value) : pending
    sessionEvidence.record('A091-N4-full-farm-executed', executed)
    const last = cultivator({}, state => farm(state, 12))
    const a = plow(last, turn(last, 0, 'forest'), { row: 2, col: 4 })
    assert.equal(a.state.players[0]!.fields.length, 13)
    assert.equal(a.state.players[0]!.resources.food, 0)
    assert.equal(a.state.players[0]!.resources.wood, 3)
    sessionEvidence.record('A091-N4-last-cell-control', a)
    const actual = { offered: Boolean(offered), commandOk: executed.ok, food: executed.state.players[0]!.resources.food, wood: executed.state.players[0]!.resources.wood, fields: executed.state.players[0]!.fields.length, pendingKind: executed.interaction.stateId === 'wait' ? executed.interaction.request.kind : executed.interaction.stateId }
    sessionEvidence.record('A091-N4-outcome', actual)
    const undone = full.undoAction()
    sessionEvidence.record('A091-N4-blocked-undo', { before: JSON.parse(before), undone })
    assertUndoRestored(before, undone)
    const declined = flow(full, turn(full, 0, 'forest'), CULT, false)
    assert.equal(declined.state.players[0]!.resources.food, 3)
    assert.equal(declined.state.players[0]!.resources.wood, 3)
    assert.equal(declined.state.players[0]!.fields.length, 13)
    sessionEvidence.record('A091-N4-undo-decline-retry', declined)
    assert.deepEqual(actual, { offered: true, commandOk: true, food: 0, wood: 0, fields: 13, pendingKind: 'engine-blocked' })
  })
  it("non wood opponent and unplayed Forest use do not create an owner plow", () => {
    const s = cultivator()
    const c = turn(s, 0, 'clay-pit')
    assert.equal(c.state.players[0]!.fields.length, 0)
    const r = turn(s, 1, 'forest')
    assert.equal(r.state.players[0]!.resources.food, 3)
    assert.equal(r.state.players[0]!.fields.length, 0)
    const u = cultivator({ played: false })
    const a = turn(u, 0, 'forest')
    assert.equal(a.state.players[0]!.fields.length, 0)
    assert.equal(a.state.players[0]!.resources.food, 3)
  })
  it("real round reset permits another paid Forest plow after occupied same round rejection", () => {
    const s = cultivator({ food: 6 })
    plow(s, turn(s, 0, 'forest'))
    turn(s, 1, 'clay-pit')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
    turn(s, 0, 'reed-bank')
    const next = confirmNext(s, turn(s, 1, 'grain-seeds'))
    assert.equal(next.state.round, 6)
    const r = plow(s, turn(s, 0, 'forest'), { row: 0, col: 2 })
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.equal(r.state.players[0]!.resources.wood, 6)
    assert.equal(r.state.players[0]!.fields.length, 2)
    sessionEvidence.record('A091-N6-two-rounds', r)
  })
  it("actual paid plow undo restores payment field worker pile logs and score before one retry", () => {
    const s = cultivator(), before = undoRuleSnapshot(s.getState())
    plow(s, turn(s, 0, 'forest'))
    const undone = s.undoAction()
    sessionEvidence.record('A091-N7-undo', { before: JSON.parse(before), undone })
    assertUndoRestored(before, undone)
    const r = plow(s, turn(s, 0, 'forest'))
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.fields.length, 1)
    sessionEvidence.record('A091-N7-retry', r)
  })
})

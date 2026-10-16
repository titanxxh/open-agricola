import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A045_FireProtectionPond'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A045_FireProtectionPond'

const FILLER = '__test_placeholder__'

const setup = ({
  houseType = 'wood',
  played = false,
  flagged = false,
}: {
  houseType?: 'wood' | 'clay'
  played?: boolean
  flagged?: boolean
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5045, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationHand = [FILLER]
  player.houseType = houseType
  player.resources = {
    ...player.resources,
    food: 1, clay: 2, stone: 2, reed: 1, wood: 0,
  }
  if (flagged) player.cardStates[CARD_ID] = { flagged: true }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')
  if (!redevelopment) throw new Error('missing house-redevelopment')
  redevelopment.roundAvailable = 1
  redevelopment.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId === 'wait') {
    const enter = getChoiceOptions(response)?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (enter) response = session.resolveChoice(0, enter.value)
  }
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      const target = getChoiceOptions(response)?.find((option) =>
        option.value === (response.state.players[0]!.houseType === 'wood' ? 'clay' : 'stone'))
      expect(target).toBeDefined()
      response = session.resolveChoice(0, target!.value)
      continue
    }
    const skip = getChoiceOptions(response)?.find((option) =>
      option.value === '__skip__' || option.value === 'skip')
    if (!skip) break
    response = session.resolveChoice(0, skip.value)
  }
  return response
}

const pondEntries = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID)

describe('A045 Fire Protection Pond parity', () => {
  it('A045 S1: a wooden-house owner pays one food to play Fire Protection Pond', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A045 S2: cannot play Fire Protection Pond outside a wooden house', () => {
    const response = enterImprovementChoice(setup({ houseType: 'clay' }))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait'
      ? getChoiceOptions(response)?.some((option) => option.value === CARD_ID)
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('A045 S3: the first renovation schedules one food for each of the next six rounds', () => {
    const response = renovate(setup({ played: true }))
    const entries = pondEntries(response)

    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(entries.map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10, 11])
    entries.forEach((entry) => expect(entry.resources).toEqual({ food: 1 }))
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A045 S4: an already triggered Fire Protection Pond does not schedule again', () => {
    const response = renovate(setup({ houseType: 'clay', played: true, flagged: true }))

    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(pondEntries(response)).toEqual([])
  })

  it('A045 S5: scheduled Fire Protection Pond food is received at the next round start', () => {
    const session = setup({ played: true })
    renovate(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(pondEntries(response).map((entry) => entry.round)).toEqual([7, 8, 9, 10, 11])
  })
})

describe("A045 command boundaries", () => {
  const POND = 'A045_FireProtectionPond'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ round = 5, played = false, occupations = 2, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [POND, '__test_placeholder__']
        p.minorPlayed = played ? [POND] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    const o = options(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
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
  function rounds(r: SessionResponse, card: string) {
    const entries = r.state.futureMeeples.filter(e => e.cardId === card)
    for (const e of entries) {
      assert.equal(e.playerId, r.state.players[0]!.id)
      assert.deepEqual(e.resources, { food: 1 })
    }
    return entries.map(e => e.round).sort((a, b) => a - b)
  }
  function complete(s: GameSession, firstRound = false) {
    if (firstRound) {
      turn(s, 1, 'forest')
      turn(s, 0, 'grain-seeds')
      return confirmNext(s, turn(s, 1, 'clay-pit'))
    }
    turn(s, 0, 'reed-bank')
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    return confirmNext(s, turn(s, 1, 'clay-pit'))
  }
  function food(r: SessionResponse) {
    return r.state.players.map(p => p.resources.food)
  }
  function renovationSetup({ round = 5, played = true, clay = 2, reed = 2, stone = 2 } = {}, configure: (state: GameState) => void = () => {
  }) {
    return setup({ round, played, resources: { clay, reed, stone } }, configure)
  }
  function renovate(s: GameSession, actor = 0) {
    let r = turn(s, actor, 'house-redevelopment')
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-next-player')
        break
      const opts = options(r)
      const target = r.state.players[actor]!.houseType === 'wood' ? 'clay' : 'stone'
      const o = opts.find(o => o.value === target) ?? opts.find(o => o.value === '__skip__' || o.value === 'skip')
      assert.ok(o, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    return r
  }
  it("wooden house and one food gate purchase without immediate schedule", () => {
    for (const houseType of ['clay', 'stone'] satisfies Array<'clay' | 'stone'>)
      deny(setup({}, state => {
        state.players[0]!.houseType = houseType
      }), POND)
    deny(setup({ resources: { food: 0 } }), POND)
    const r = buy(setup(), POND)
    assert.equal(r.state.players[0]!.resources.food, 39)
    assert.deepEqual(rounds(r, POND), [])
  })
  it("actual purchase and first renovation schedule once before natural later stone renovation", () => {
    const s = renovationSetup({ played: false })
    buy(s, POND)
    turn(s, 1, 'forest')
    let r = renovate(s)
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11])
    assert.equal(r.state.players[0]!.cardStates[POND]?.flagged, true)
    r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, 6)
    assert.deepEqual(food(r), [40, 40])
    assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11])
    r = renovate(s)
    assert.equal(r.state.players[0]!.houseType, 'stone')
    assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11])
    for (let i = 0; i < 6; i++) {
      r = complete(s, i === 0)
      assert.equal(r.state.round, 7 + i)
      assert.deepEqual(food(r), [[41, 40], [38, 36], [39, 36], [36, 32], [37, 32], [33, 28]][i])
      assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11].filter(round => round > 7 + i))
    }
  })
  it("real opponent renovation and owner unrelated action cannot schedule owner pond", () => {
    const s = renovationSetup({}, state => {
      Object.assign(state.players[1]!.resources, { clay: 2, reed: 1 })
    })
    turn(s, 0, 'grain-seeds')
    const r = renovate(s, 1)
    assert.equal(r.state.players[1]!.houseType, 'clay')
    assert.equal(r.state.players[0]!.houseType, 'wood')
    assert.deepEqual(rounds(r, POND), [])
    assert.equal(r.state.players[0]!.cardStates[POND]?.flagged ?? false, false)
  })
  it("controlled late real renovation truncates next six rounds", () => {
    for (const { round, expected } of [{ round: 13, expected: [14] }, { round: 14, expected: [] }]) {
      const r = renovate(renovationSetup({ round }))
      assert.equal(r.state.players[0]!.houseType, 'clay')
      assert.equal(r.state.players[0]!.cardStates[POND]?.flagged, true)
      assert.deepEqual(rounds(r, POND), expected)
    }
  })
  it("unaffordable renovation rejects then legal renovation undo and retry restores flag and schedule", () => {
    const unavailable = renovationSetup({ clay: 1, reed: 0 })
    assertRejectedUnchanged(unavailable, () => unavailable.takeAction(0, 'house-redevelopment'))
    assert.deepEqual(rounds(unavailable.getState(), POND), [])
    const s = renovationSetup()
    const before = undoRuleSnapshot(s.getState())
    let r = renovate(s)
    assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11])
    assertUndoRestored(before, s.undoAction())
    r = renovate(s)
    assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11])
  })
})

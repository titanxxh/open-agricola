import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A045_FireProtectionPond'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Future from './_helpers/audit/ae-negative-07-future'

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
  const session = new GameSession(5045, undefined, { playerCount: 2 })
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
    const enter = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (enter) response = session.resolveChoice(0, enter.value)
  }
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      const target = response.interaction.request.options?.find((option) =>
        option.value === (response.state.players[0]!.houseType === 'wood' ? 'clay' : 'stone'))
      expect(target).toBeDefined()
      response = session.resolveChoice(0, target!.value)
      continue
    }
    const skip = response.interaction.request.options?.find((option) =>
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

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === CARD_ID)
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

describe('ae-negative-07-future', () => {
  const { POND, sessions, setup, buy, deny, turn, rounds, complete, food, renovationSetup, renovate } = audit07Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A045 N1 wooden house and one food gate purchase without immediate schedule', () => {
    for (const houseType of ['clay', 'stone'] satisfies Array<'clay' | 'stone'>) deny(setup(POND, {}, state => { state.players[0]!.houseType = houseType }), POND)
    deny(setup(POND, { resources: { food: 0 } }), POND)
    const r = buy(setup(POND), POND); assert.equal(r.state.players[0]!.resources.food, 39); assert.deepEqual(rounds(r, POND), [])
  })
  it('A045 N2 actual purchase and first renovation schedule once before natural later stone renovation', () => {
    const s = renovationSetup({ played: false }); buy(s, POND); turn(s, 1, 'forest'); let r = renovate(s)
    assert.equal(r.state.players[0]!.houseType, 'clay'); assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11]); assert.equal(r.state.players[0]!.cardStates[POND]?.flagged, true)
    r = confirmNext(s, turn(s, 1, 'clay-pit')); assert.equal(r.state.round, 6); assert.deepEqual(food(r), [40, 40]); assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11])
    r = renovate(s); assert.equal(r.state.players[0]!.houseType, 'stone'); assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11])
    for (let i = 0; i < 6; i++) { r = complete(s, i === 0); assert.equal(r.state.round, 7 + i); assert.deepEqual(food(r), [[41, 40], [38, 36], [39, 36], [36, 32], [37, 32], [33, 28]][i]); assert.deepEqual(rounds(r, POND), [7, 8, 9, 10, 11].filter(round => round > 7 + i)) }
  })
  it('A045 N3 real opponent renovation and owner unrelated action cannot schedule owner pond', () => {
    const s = renovationSetup({}, state => { Object.assign(state.players[1]!.resources, { clay: 2, reed: 1 }) }); turn(s, 0, 'grain-seeds'); const r = renovate(s, 1)
    assert.equal(r.state.players[1]!.houseType, 'clay'); assert.equal(r.state.players[0]!.houseType, 'wood'); assert.deepEqual(rounds(r, POND), []); assert.equal(r.state.players[0]!.cardStates[POND]?.flagged ?? false, false)
  })
  it('A045 N4 controlled late real renovation truncates next six rounds', () => {
    for (const round of [13, 14]) { const r = renovate(renovationSetup({ round })); assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(r.state.players[0]!.cardStates[POND]?.flagged, true); assert.deepEqual(rounds(r, POND), round === 13 ? [14] : []) }
  })
  it('A045 N5 unaffordable renovation rejects then legal renovation undo and retry restores flag and schedule', () => {
    const unavailable = renovationSetup({ clay: 1, reed: 0 }); assertRejectedUnchanged(unavailable, () => unavailable.takeAction(0, 'house-redevelopment')); assert.deepEqual(rounds(unavailable.getState(), POND), [])
    const s = renovationSetup(); const before = undoRuleSnapshot(s.getState()); let r = renovate(s); assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11]); assertUndoRestored(before, s.undoAction()); r = renovate(s); assert.deepEqual(rounds(r, POND), [6, 7, 8, 9, 10, 11])
  })
})

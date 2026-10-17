import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A052_ThrowingAxe } from '../../shared/cards/A/A052_ThrowingAxe'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import '../../shared/cards/A/A051_DriftNetBoat'
import '../../shared/cards/A/A053_Claypipe'
import '../../shared/cards/A/A006_StorageBarn'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit08Triggers from './_helpers/audit/ae-negative-08-triggers'

describe('A052_ThrowingAxe prerequisite', () => {
  it('blocks when round < 7', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state))).toBe(false)
  })

  it('allows when round >= 7', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 7
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state))).toBe(true)
  })
})

describe('A052 Throwing Axe parity', () => {
  const CARD_ID = 'A052_ThrowingAxe'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, round = 7, actor = 0, pigs = 1,
  }: {
    played?: boolean
    round?: number
    actor?: number
    pigs?: number
  } = {}) => {
    const session = new GameSession(6052, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    if (played) owner.minorPlayed = [CARD_ID]
    else {
      owner.minorHand = [CARD_ID, FILLER]
      owner.resources.wood = 1
    }
    state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = pigs
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('A052 S1: in round seven paying one wood plays Throwing Axe', () => {
    const response = playCard(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A052 S2: before round seven Throwing Axe remains unavailable', () => {
    const response = enterMinor(setup({ played: false, round: 6 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A052 S3: using a wood accumulation space while Pig Market holds a pig gains two food', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 2 })
  })

  it('A052 S4: an empty Pig Market prevents the food bonus', () => {
    const response = setup({ pigs: 0 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
  })

  it('A052 S5: a non-wood accumulation space and an opponent wood action grant the owner no food', () => {
    const nonWood = setup().takeAction(0, 'day-laborer')
    expect(nonWood.ok, nonWood.error).toBe(true)
    expect(nonWood.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })

    const opponent = setup({ actor: 1 }).takeAction(1, 'forest')
    expect(opponent.ok, opponent.error).toBe(true)
    expect(opponent.state.players[0]!.resources.food).toBe(0)
    expect(opponent.state.players[1]!.resources).toMatchObject({ food: 0, wood: 3 })
  })
})

describe('ae-negative-08-triggers', () => {
  const { AXE, sessions, scenario, setup, ok, ready, turn, enter, buy, values, bonus, retryFree, barn, addBarn } = audit08Triggers
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  scenario('A052 N1 round seven permits the actual one wood purchase', () => { const s = setup(AXE, { played: false, round: 7, resources: { wood: 1 } }); const r = buy(s, enter(s), AXE); assert.equal(values(r).wood, 0); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 0, cardPlayed: true } })
  scenario('A052 N2 round six rejects a forged early purchase before a legal retry', () => { const s = setup(AXE, { played: false, round: 6, resources: { wood: 1 } }); const r = retryFree(s, AXE); assert.equal(values(r).wood, 1); assert.equal(r.state.players[0]!.minorHand.includes(AXE), true); return { round: 6, wood: 1, cardInHand: true } })
  scenario('A052 N3 zero wood rejects a forged purchase in round seven before a legal retry', () => { const s = setup(AXE, { played: false, round: 7 }); const r = retryFree(s, AXE); assert.equal(values(r).wood, 0); assert.equal(r.state.players[0]!.minorHand.includes(AXE), true); return { round: 7, wood: 0, cardInHand: true } })
  scenario('A052 N4 Forest with one market pig grants exactly two food', () => { const r = turn(setup(AXE, { round: 10 }), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); bonus(r, AXE, 2); return { wood: 3, food: 22, marketPigs: 1 } })
  scenario('A052 N5 zero market pigs prevent the Forest food bonus', () => { const r = turn(setup(AXE, { round: 10, pigs: 0 }), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 3, food: 20, marketPigs: 0 } })
  scenario('A052 N6 two market pigs still grant only two food', () => { const r = turn(setup(AXE, { round: 10, pigs: 2 }), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); bonus(r, AXE, 2); return { wood: 3, food: 22, marketPigs: 2 } })
  scenario('A052 N7 Day Laborer is not a wood accumulation space', () => { const r = turn(setup(AXE, { round: 10 }), 0, 'day-laborer'); assert.equal(values(r).food, 22); assert.equal(values(r).wood, 0); bonus(r, AXE, 0); return { food: 22, wood: 0 } })
  scenario('A052 N8 Storage Barn wood from a real Joinery gives no accumulation bonus', () => { const s = setup(AXE, { round: 10, configure: addBarn }); const r = barn(s); assert.equal(values(r).wood, 1); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 1, food: 20 } })
  scenario('A052 N9 opponent Forest cannot grant owner or opponent food from the owner card', () => { const s = setup(AXE, { round: 10 }); turn(s, 0, 'grain-seeds'); const r = turn(s, 1, 'forest'); assert.equal(values(r).food, 20); assert.equal(values(r, 1).food, 20); assert.equal(values(r, 1).wood, 3); bonus(r, AXE, 0); return { ownerFood: 20, opponentFood: 20, opponentWood: 3 } })
  scenario('A052 N10 Forest while the card is in hand gives no food bonus', () => { const r = turn(setup(AXE, { round: 10, played: false }), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 3, food: 20 } })
  scenario('A052 N11 empty Forest rejects even with a pig on the market', () => { const s = setup(AXE, { round: 10, forest: 0 }); const r = assertEmptyAccumulationRejected(s, 0, 'forest'); assert.equal(values(r).wood, 0); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { emptyEntryRejected: true, supplementalFood: 0 } })
  scenario('A052 N12 a real Pig Market clearance removes the condition before owner Forest', () => {
    const s = setup(AXE, { round: 10 }); turn(s, 0, 'grain-seeds'); let r = turn(s, 1, 'pig-market')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') r = ok(s.resolveChoice(1, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'boar', animalCount: 1 }] }))
    assert.equal(values(r, 1).boar, 1); assert.equal(countRoomAnimals(r.state.players[1]!), 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar, 0)
    r = turn(s, 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 3, food: 20, marketPigs: 0, opponentHousedPigs: 1 }
  })
  scenario('A052 N13 occupied Forest rejects a repeated request before a legal retry', () => { const s = setup(AXE, { round: 10 }); turn(s, 0, 'forest'); turn(s, 1, 'grain-seeds'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'forest')); const r = turn(s, 0, 'clay-pit'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); return { wood: 3, food: 22 } })
})

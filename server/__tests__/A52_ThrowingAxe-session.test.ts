import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { describe, expect, it } from 'vitest'
import { A052_ThrowingAxe } from '../../shared/cards/A/A052_ThrowingAxe'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
describe('A052_ThrowingAxe prerequisite', () => {
  it('blocks when round < 7', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state))).toBe(false)
  })
  it('allows when round >= 7', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    state.round = 7
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state))).toBe(true)
  })
})
describe('A052 Throwing Axe parity', () => {
  const CARD_ID = 'A052_ThrowingAxe'
  const FILLER = '__test_placeholder__'
  const setup = ({ played = true, round = 7, actor = 0, pigs = 1, }: {
    played?: boolean
    round?: number
    actor?: number
    pigs?: number
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6052, options: { playerCount: 2 } }))
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
    ? getChoiceOptions(response) ?? []
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
    assert.ok(response.interaction.stateId === 'wait')
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
describe("A052 command boundaries", () => {
  const AXE = 'A052_ThrowingAxe'
  function setup({ played = true, round = 5, resources = {}, forest = 3, fishing = 2, pigs = 1, configure = () => { } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    forest?: number
    fishing?: number
    pigs?: number
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = ["A052_ThrowingAxe"]
        else
          p.minorHand.push("A052_ThrowingAxe")
        Object.assign(p.resources, resources)
        stock(state, 'forest', 'wood', forest)
        stock(state, 'fishing', 'food', fishing)
        stock(state, 'pig-market', 'boar', pigs)
        configure(state)
      } }))
    assert.equal(s.getState().state.roundPhase, 'work')
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'boar' | 'clay', count: number) {
    const action = state.actionSpaces.find(a => a.id === space)
    assert.ok(action)
    action.resources[resource] = count
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const r = ok(s.takeAction(actor, space)); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id), true); return r; }
  function choices(r: SessionResponse) { ok(r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function offered(r: SessionResponse, card: string) { return choices(r).some(o => o.value === card && !o.disabled); }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.equal(offered(r, card), true)
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), card !== 'A006_StorageBarn')
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    if (card === 'A006_StorageBarn') {
      assert.equal(result.state.players[1]!.minorHand.includes(card), true)
      const gains = result.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card)
      assert.equal(gains.length, 1)
      const gain = gains[0]!
      assert.ok(gain.type === 'resource.moved')
      assert.deepEqual(gain.resources, { wood: 1 })
      assert.ok(result.interaction.stateId === 'wait' && result.interaction.request.kind === 'confirm-next-player', JSON.stringify(result.interaction))
      assert.equal(result.interaction.playerIndex, 0)
      assert.equal(result.state.currentPlayerIndex, 0)
      return result
    }
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === AXE ? { wood: 1 } : {})
    assert.ok(result.interaction.stateId === 'wait' && result.interaction.request.kind === 'confirm-next-player', JSON.stringify(result.interaction))
    assert.equal(result.interaction.playerIndex, 0)
    assert.equal(result.state.currentPlayerIndex, 0)
    return result
  }
  function values(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources; }
  function bonus(r: SessionResponse, card: string, amount: number) {
    const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card && e.reason === 'cardEffect')
    assert.equal(events.length, amount === 0 ? 0 : 1)
    if (amount) {
      const e = events[0]!
      assert.ok(e.type === 'resource.moved')
      assert.deepEqual(e.resources, { food: amount })
      assert.deepEqual(e.to, { kind: 'player', playerId: r.state.players[0]!.id })
    }
  }
  function retryFree(s: GameSession, card: string) { const r = enter(s); assert.equal(offered(r, card), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); return buy(s, r, 'A054_Credit'); }
  function barn(s: GameSession) { return buy(s, enter(s), 'A006_StorageBarn'); }
  function addBarn(state: GameState) { state.players[0]!.minorHand.push('A006_StorageBarn'); state.players[0]!.improvements = ['Major_Joinery']; }
  it("round seven permits the actual one wood purchase", () => { const s = setup({ played: false, round: 7, resources: { wood: 1 } }); const r = buy(s, enter(s), AXE); assert.equal(values(r).wood, 0); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 0, cardPlayed: true }; })
  it("round six rejects a forged early purchase before a legal retry", () => { const s = setup({ played: false, round: 6, resources: { wood: 1 } }); const r = retryFree(s, AXE); assert.equal(values(r).wood, 1); assert.equal(r.state.players[0]!.minorHand.includes(AXE), true); return { round: 6, wood: 1, cardInHand: true }; })
  it("zero wood rejects a forged purchase in round seven before a legal retry", () => { const s = setup({ played: false, round: 7 }); const r = retryFree(s, AXE); assert.equal(values(r).wood, 0); assert.equal(r.state.players[0]!.minorHand.includes(AXE), true); return { round: 7, wood: 0, cardInHand: true }; })
  it("Forest with one market pig grants exactly two food", () => { const r = turn(setup({ round: 10 }), 0, 'forest');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); bonus(r, AXE, 2); return { wood: 3, food: 22, marketPigs: 1 }; })
  it("zero market pigs prevent the Forest food bonus", () => { const r = turn(setup({ round: 10, pigs: 0 }), 0, 'forest');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 3, food: 20, marketPigs: 0 }; })
  it("two market pigs still grant only two food", () => { const r = turn(setup({ round: 10, pigs: 2 }), 0, 'forest');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); bonus(r, AXE, 2); return { wood: 3, food: 22, marketPigs: 2 }; })
  it("Day Laborer is not a wood accumulation space", () => { const r = turn(setup({ round: 10 }), 0, 'day-laborer');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).food, 22); assert.equal(values(r).wood, 0); bonus(r, AXE, 0); return { food: 22, wood: 0 }; })
  it("Storage Barn wood from a real Joinery gives no accumulation bonus", () => { const s = setup({ round: 10, configure: addBarn }); const r = barn(s); assert.equal(values(r).wood, 1); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 1, food: 20 }; })
  it("opponent Forest cannot grant owner or opponent food from the owner card", () => { const s = setup({ round: 10 }); turn(s, 0, 'grain-seeds'); const r = turn(s, 1, 'forest');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
     assert.equal(values(r).food, 20); assert.equal(values(r, 1).food, 20); assert.equal(values(r, 1).wood, 3); bonus(r, AXE, 0); return { ownerFood: 20, opponentFood: 20, opponentWood: 3 }; })
  it("Forest while the card is in hand gives no food bonus", () => { const r = turn(setup({ round: 10, played: false }), 0, 'forest');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { wood: 3, food: 20 }; })
  it("empty Forest rejects even with a pig on the market", () => { const s = setup({ round: 10, forest: 0 }); const r = assertEmptyAccumulationRejected(s, 0, 'forest');
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 0); assert.equal(values(r).food, 20); bonus(r, AXE, 0); return { emptyEntryRejected: true, supplementalFood: 0 }; })
  it("a real Pig Market clearance removes the condition before owner Forest", () => {
    const s = setup({ round: 10 })
    turn(s, 0, 'grain-seeds')
    let r = turn(s, 1, 'pig-market')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = ok(s.resolveChoice(1, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'boar', animalCount: 1 }] }))
    assert.equal(values(r, 1).boar, 1)
    assert.equal(countRoomAnimals(r.state.players[1]!), 1)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar, 0)
    r = turn(s, 0, 'forest')
    assert.equal(values(r).wood, 3)
    assert.equal(values(r).food, 20)
    bonus(r, AXE, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return { wood: 3, food: 20, marketPigs: 0, opponentHousedPigs: 1 }
  })
  it("occupied Forest rejects a repeated request before a legal retry", () => { const s = setup({ round: 10 }); turn(s, 0, 'forest'); turn(s, 1, 'grain-seeds'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'forest')); const r = turn(s, 0, 'clay-pit');
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
     assert.equal(values(r).wood, 3); assert.equal(values(r).food, 22); return { wood: 3, food: 22 }; })
})

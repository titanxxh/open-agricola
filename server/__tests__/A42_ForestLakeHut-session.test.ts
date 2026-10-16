import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A042_ForestLakeHut'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A042_ForestLakeHut'

const FILLER = '__test_placeholder__'

describe('A042_ForestLakeHut session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    owner.minorPlayed.push(CARD_ID)

    // Stock the relevant spaces with some resources.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 3

    session.loadState(state)
    return session
  }

  const setupPurchase = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 5042, options: { playerCount: 2 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.resources.clay = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  it('A042 S1: paying two clay plays Forest Lake Hut', () => {
    const session = setupPurchase()
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId === 'wait') {
      const enter = getChoiceOptions(response)?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (enter) response = session.resolveChoice(0, enter.value)
    }
    if (response.interaction.stateId === 'wait') {
      const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('A042 S2: using Fishing grants its food and one additional wood', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0
    const foodBefore = state.players[0]!.resources.food ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Fishing normal gain is 2 food; card adds +1 wood.
    expect(p.resources.wood).toBe(woodBefore + 1)
    expect(p.resources.food).toBe(foodBefore + 2)
  })

  it('A042 S3: using Forest grants its wood and one additional food', () => {
    const session = setup()
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food ?? 0
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Forest normal gain is 3 wood; card adds +1 food.
    expect(p.resources.wood).toBe(woodBefore + 3)
    expect(p.resources.food).toBe(foodBefore + 1)
  })

  it('A042 S4: using another action grants no Forest Lake Hut bonus', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer gives food but the Forest Lake Hut must NOT add wood.
    expect(p.resources.wood).toBe(woodBefore)
  })

  it('does not trigger when card is not in play', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    // Card NOT played.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    session.loadState(state)
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(woodBefore)
  })
})

describe("A042 command boundaries", () => {
  const HUT = 'A042_ForestLakeHut'
  function setup({ played = true, round = 5, resources = {}, configure = () => {
  } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
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
          p.minorPlayed = [HUT]
        else
          p.minorHand.push(HUT)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'sheep' | 'cattle', count: number) {
    const action = state.actionSpaces.find(a => a.id === space)
    assert.ok(action)
    action.resources[resource] = count
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
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
    return space === 'meeting-place' ? r : confirmed(r, actor)
  }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function offered(r: SessionResponse, card: string) {
    return choices(r).some(o => o.value === card && !o.disabled)
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.equal(offered(r, card), true)
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === HUT ? { clay: 2 } : {})
    return confirmed(result)
  }
  function printedPoint(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === card)?.score, 1)
  }
  function hutReward(r: SessionResponse, gain: {
    wood?: number
    food?: number
  }) {
    const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === HUT && e.reason === 'cardEffect')
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'resource.moved')
    assert.deepEqual(event.resources, gain)
    assert.deepEqual(event.to, { kind: 'player', playerId: r.state.players[0]!.id })
  }
  it("actual purchase pays two clay and earns one printed point", () => {
    const s = setup({ played: false, resources: { clay: 2 } })
    const r = buy(s, enter(s), HUT)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    printedPoint(r, HUT)
  })
  it("one clay cannot forge purchase before a legal free card retry", () => {
    const s = setup({ played: false, resources: { clay: 1 } })
    const r = enter(s)
    assert.equal(offered(r, HUT), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HUT))
    const done = buy(s, r, 'A054_Credit')
    assert.equal(done.state.players[0]!.resources.clay, 1)
    assert.equal(done.state.players[0]!.minorHand.includes(HUT), true)
  })
  it("using stocked Forest gains exactly one additional food", () => {
    const s = setup({ resources: { food: 0 }, configure(state) {
        stock(state, 'forest', 'wood', 3)
      } })
    const r = turn(s, 0, 'forest')
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [3, 1])
    hutReward(r, { food: 1 })
  })
  it("using stocked Fishing gains exactly one additional wood", () => {
    const s = setup({ resources: { food: 0 }, configure(state) {
        stock(state, 'fishing', 'food', 2)
      } })
    const r = turn(s, 0, 'fishing')
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [1, 2])
    hutReward(r, { wood: 1 })
  })
  it("ordinary food or wood gains outside Fishing and Forest grant no bonus", () => {
    const a = setup({ resources: { food: 0 } })
    const day = turn(a, 0, 'day-laborer')
    assert.deepEqual([day.state.players[0]!.resources.wood, day.state.players[0]!.resources.food], [0, 2])
    const b = setup({ resources: { food: 0 }, configure(state) {
        state.players[0]!.minorHand.push('A006_StorageBarn')
        state.players[0]!.improvements.push('Major_Joinery')
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Joinery')
      } })
    const offer = enter(b)
    assert.equal(offered(offer, 'A006_StorageBarn'), true)
    const barn = confirmed(ok(b.resolveChoice(0, 'A006_StorageBarn')))
    assert.deepEqual([barn.state.players[0]!.resources.wood, barn.state.players[0]!.resources.food], [1, 0])
    assert.equal(barn.state.players[1]!.minorHand.includes('A006_StorageBarn'), true)
  })
  it("an opponent action and an owner card still in hand grant no owner bonus", () => {
    const a = setup({ resources: { food: 0 }, configure(state) {
        stock(state, 'fishing', 'food', 2)
      } })
    turn(a, 0, 'grain-seeds')
    const other = turn(a, 1, 'fishing')
    assert.equal(other.state.players[0]!.resources.wood, 0)
    assert.equal(other.state.players[1]!.resources.wood, 0)
    assert.equal(other.state.players[1]!.resources.food, 22)
    const b = setup({ played: false, resources: { food: 0 }, configure(state) {
        stock(state, 'fishing', 'food', 2)
      } })
    const hand = turn(b, 0, 'fishing')
    assert.deepEqual([hand.state.players[0]!.resources.wood, hand.state.players[0]!.resources.food], [0, 2])
  })
  it("empty Forest and Fishing reject atomically without a Fishing Hut bonus", () => {
    for (const space of ['forest', 'fishing']) {
      const s = setup({ resources: { food: 0 }, configure(state) {
          stock(state, space, space === 'forest' ? 'wood' : 'food', 0)
        } })
      const r = assertEmptyAccumulationRejected(s, 0, space)
      assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [0, 0])
      assert.equal(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === HUT).length, 0)
    }
  })
  it("occupied Forest rejects a second use before a legal action retry", () => {
    const s = setup({ resources: { food: 0 }, configure(state) {
        stock(state, 'forest', 'wood', 3)
      } })
    turn(s, 0, 'forest')
    turn(s, 1, 'grain-seeds')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
    const r = turn(s, 0, 'clay-pit')
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [3, 1])
  })
})

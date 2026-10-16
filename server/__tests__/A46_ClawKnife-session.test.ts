import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { A046_ClawKnife } from '../../shared/cards/A/A046_ClawKnife'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A046_ClawKnife'

const FILLER = '__test_placeholder__'

const pasture = (id: string, col: number) => ({
  id,
  tiles: [{ row: 0, col }],
  animalType: null,
  animalCount: 0,
})

const setup = ({ pastures = 1, round = 5, played = true, actor = 0 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5046, options: { playerCount: 2 } }))
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
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = played ? 0 : 1
  player.pastures = Array.from({ length: pastures }, (_, index) => pasture(`p${index + 1}`, index))
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
  if (!sheepMarket) throw new Error('sheep-market missing')
  sheepMarket.resources.sheep = 1
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) {
    const improvement = getChoiceOptions(response)?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  return response
}

const playClawKnife = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const futureRounds = (session: GameSession) => session.getState().state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

const useSheepMarket = (session: GameSession, actor = 0) => {
  let response = session.takeAction(actor, 'sheep-market')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg'
  ) {
    const zones = actor === 0
      ? [{ id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }]
      : [{ id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 }]
    response = session.resolveChoice(actor, 'confirm', { zones })
  }
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

describe('A046_ClawKnife prerequisite', () => {
  it('blocks when player has zero pastures', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = []
    expect(session.withCtx(() => meetsCardPrerequisites(player, A046_ClawKnife, state.round, state))).toBe(false)
  })

  it('allows when player has exactly 1 pasture', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 0, col: 0 }],
      animalType: null,
      animalCount: 0,
    }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, A046_ClawKnife, state.round, state))).toBe(true)
  })

  it('blocks when player has 2 pastures', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 },
      { id: 'p2', tiles: [{ row: 1, col: 0 }], animalType: null, animalCount: 0 },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, A046_ClawKnife, state.round, state))).toBe(false)
  })
})

describe('A046 Claw Knife parity', () => {
  it('A046 S1: exactly one pasture allows paying one wood to play Claw Knife', () => {
    const response = playClawKnife(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it.each([['S2', 0], ['S3', 2]])(
    'A046 %s: %i pastures keep Claw Knife unavailable',
    (_scenario, pastures) => {
      const response = openMinorPrompt(setup({ pastures, played: false }))

      expect(response.interaction.stateId === 'wait'
        ? getChoiceOptions(response)?.some((option) => option.value === CARD_ID) ?? false
        : false).toBe(false)
      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    },
  )

  it('A046 S4: using Sheep Market schedules food on each of the next two rounds', () => {
    const session = setup({ round: 5 })
    const response = useSheepMarket(session)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([6, 7])
  })

  it('A046 S5: a non-Sheep-Market action schedules no food', () => {
    const session = setup({ round: 5 })
    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([])
  })

  it('A046 S6: at round thirteen only the reachable round fourteen food is scheduled', () => {
    const session = setup({ round: 13 })
    const response = useSheepMarket(session)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([14])
  })

  it('A046 S7: another player using Sheep Market schedules no food for the owner', () => {
    const session = setup({ actor: 1 })
    const response = useSheepMarket(session, 1)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([])
  })
})

describe("A046 command boundaries", () => {
  const KNIFE = 'A046_ClawKnife'
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
          p.minorPlayed = [KNIFE]
        else
          p.minorHand.push(KNIFE)
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
  function pasture(state: GameState, count = 1) {
    const p = state.players[0]!
    p.pastures = Array.from({ length: count }, (_, n) => ({ id: `pasture-${n + 1}`, tiles: [{ row: 0, col: n + 1 }], animalType: null, animalCount: 0 }))
    p.fenceSegments = Array.from({ length: count }, (_, n) => [`H-0-${n + 1}`, `H-1-${n + 1}`, `V-0-${n + 1}`, `V-0-${n + 2}`]).flat().filter((e, i, edges) => edges.indexOf(e) === i).map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  }
  function knife({ played = true, round = 5, pastures = 1, resources = {}, configure = () => {
  } }: {
    played?: boolean
    round?: number
    pastures?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    return setup({ played, round, resources, configure(state) {
        pasture(state, pastures)
        stock(state, 'sheep-market', 'sheep', 1)
        configure(state)
      } })
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function newRound(r: SessionResponse) {
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
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
    return ['forest', 'grain-seeds', 'clay-pit'].includes(space) ? confirmed(r, actor) : r
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
    assert.deepEqual(event.payment?.resources ?? {}, card === KNIFE ? { wood: 1 } : {})
    return confirmed(result)
  }
  function printedPoint(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === card)?.score, 1)
  }
  function future(r: SessionResponse, card: string) {
    return r.state.futureMeeples.filter(m => m.cardId === card && m.playerId === r.state.players[0]!.id).flatMap(m => {
      assert.deepEqual(m.resources, { food: 1 })
      return [m.round]
    }).sort((a, b) => a - b)
  }
  function settleAnimals(s: GameSession, r: SessionResponse, actor = 0, count = 1, discard = false) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      const zones = discard ? [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 2 }, { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }] : [{ id: actor === 0 ? 'pasture-1' : 'house:2-0', zoneType: actor === 0 ? 'pasture' : 'house', animalType: 'sheep', animalCount: count }]
      r = ok(s.resolveChoice(actor, 'confirm', { zones }))
    }
    assert.equal(r.state.players[actor]!.resources.sheep, discard ? 0 : count)
    return confirmed(r, actor)
  }
  function market(s: GameSession, actor = 0, count = 1, discard = false) {
    return settleAnimals(s, turn(s, actor, 'sheep-market'), actor, count, discard)
  }
  function nextRound(s: GameSession) {
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const end = turn(s, 1, 'clay-pit')
    const r = confirmNext(s, end)
    assert.equal(r.state.round, 6)
    assert.equal(r.state.roundPhase, 'work')
    return newRound(r)
  }
  it("exactly one real pasture permits paying one wood and earns one printed point", () => {
    const s = knife({ played: false, resources: { wood: 1 } })
    const r = buy(s, enter(s), KNIFE)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    printedPoint(r, KNIFE)
  })
  it("zero or two pastures or no wood rejects purchase before a legal retry", () => {
    for (const config of [{ pastures: 0, wood: 1 }, { pastures: 2, wood: 1 }, { pastures: 1, wood: 0 }]) {
      const s = knife({ played: false, pastures: config.pastures, resources: { wood: config.wood } })
      const r = enter(s)
      assert.equal(offered(r, KNIFE), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, KNIFE))
      const done = buy(s, r, 'A054_Credit')
      assert.equal(done.state.players[0]!.resources.wood, config.wood)
      assert.deepEqual(future(done, KNIFE), [])
    }
  })
  it("actual Sheep Market use schedules exactly two future owner food", () => {
    const s = knife()
    const r = market(s)
    assert.deepEqual(future(r, KNIFE), [6, 7])
    assert.equal(r.state.players[0]!.resources.food, 20)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'sheep-market'))
  })
  it("empty Sheep Market rejects without obtaining animals or scheduling knives", () => {
    const s = knife({ configure(state) {
        stock(state, 'sheep-market', 'sheep', 0)
      } })
    const r = assertEmptyAccumulationRejected(s, 0, 'sheep-market')
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.deepEqual(future(r, KNIFE), [])
  })
  it("discarding acquired sheep does not change the Sheep Market use trigger", () => {
    const s = knife({ configure(state) {
        const p = state.players[0]!
        p.pastures[0]!.animalType = 'boar'
        p.pastures[0]!.animalCount = 2
        p.resources.boar = 2
        p.houseAnimals = { '2-0': 'cattle' }
        p.resources.cattle = 1
      } })
    const r = market(s, 0, 1, true)
    assert.equal(r.state.players[0]!.resources.boar, 2)
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    assert.deepEqual(future(r, KNIFE), [6, 7])
  })
  it("Cattle Market animal gain cannot trigger a Sheep Market schedule", () => {
    const s = knife({ round: 11, configure(state) {
        stock(state, 'cattle-market', 'cattle', 1)
      } })
    let r = turn(s, 0, 'cattle-market')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = ok(s.resolveChoice(0, 'confirm', { zones: [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 }] }))
    confirmed(r)
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    assert.deepEqual(future(r, KNIFE), [])
  })
  it("the card still in hand does not schedule food after Sheep Market", () => {
    const s = knife({ played: false })
    const r = market(s)
    assert.equal(r.state.players[0]!.minorHand.includes(KNIFE), true)
    assert.deepEqual(future(r, KNIFE), [])
  })
  it("another player using Sheep Market cannot schedule food for the owner", () => {
    const s = knife()
    turn(s, 0, 'grain-seeds')
    const r = market(s, 1)
    assert.deepEqual(future(r, KNIFE), [])
    assert.equal(r.state.players[1]!.resources.sheep, 1)
  })
  it("round thirteen and fourteen schedule only reachable next two round spaces", () => {
    for (const { round, expected } of [{ round: 13, expected: [14] }, { round: 14, expected: [] }]) {
      const s = knife({ round })
      const r = market(s)
      assert.deepEqual(future(r, KNIFE), expected)
    }
  })
  it("a natural next round delivers exactly one food and preserves the second due food", () => {
    const s = knife()
    market(s)
    const r = nextRound(s)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.players[1]!.resources.food, 20)
    assert.deepEqual(future(r, KNIFE), [7])
  })
  it("a real Sheep Market use in the next round schedules a fresh pair without same turn duplication", () => {
    const s = knife()
    market(s)
    nextRound(s)
    const r = market(s, 0, 2)
    assert.deepEqual(future(r, KNIFE), [7, 7, 8])
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
  })
})

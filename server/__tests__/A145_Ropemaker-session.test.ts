import { captureStateWithHistory } from '../../shared/session/history-streams'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A145_Ropemaker'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A145_Ropemaker'

const setup = ({ round, inHand = false }: { round: number; inHand?: boolean }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 145, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, inHand && player === state.players[0] ? 2 : 0)
    player.resources.food = 8
  })
  const owner = state.players[0]!
  owner.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  owner.occupationPlayed = inHand ? [] : [CARD_ID]
  owner.resources.reed = 0
  if (!inHand) state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

describe('A145 Ropemaker parity', () => {
  it('A145 S1: playing Ropemaker in a four-player game keeps the occupation in play', () => {
    const response = playOccupation(setup({ round: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A145 S2: the end of a harvest grants one reed', () => {
    const response = autoAdvanceRoundEnd(setup({ round: 4 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A145 S3: a non-harvest round end grants no reed', () => {
    const response = autoAdvanceRoundEnd(setup({ round: 3 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(4)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('A145 S4: two harvests grant two reed cumulatively', () => {
    const session = setup({ round: 4 })
    let response = autoAdvanceRoundEnd(session)
    const state = response.state
    state.round = 7
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      player.resources.food = 8
      markAllWorkersUsed(state, player)
    })
    session.loadState(state)

    response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(2)
  })
})

describe("A145 command boundaries", () => {
  const ROPE = 'A145_Ropemaker'
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(round = 5, configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = round
        state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 1
        for (const p of state.players)
          Object.assign(p.resources, { food: 60, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [ROPE] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [ROPE, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function finish(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else {
        if (i.request.kind === 'choice' && i.promptKey === 'ui.interactionChooseOccupation' && i.playerIndex !== 0) {
          const other = i.request.options.find(o => o.value === 'A110_Roughcaster')
          assert.ok(other)
          r = ok(s.resolveChoice(i.playerIndex, other.value))
          continue
        }
        assert.fail(JSON.stringify(i))
      }
    }
    assert.ok(r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'), JSON.stringify(r.interaction))
    return r
  }
  function endWork(s: GameSession, spaces: string[]) {
    let r = s.getState()
    for (const [n, space] of spaces.entries()) {
      const actor = n % r.state.players.length
      r = turn(s, actor, space)
      if (n < spaces.length - 1)
        r = finish(s, r)
    }
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    save('before-phase-choice', r)
    return r
  }
  function end(s: GameSession, spaces: string[]) {
    const nextRound = s.getState().state.round + 1
    const r = endWork(s, spaces)
    const pending = { ...r, state: captureStateWithHistory(r.state), interaction: structuredClone(r.interaction), scores: structuredClone(r.scores) }
    const done = finish(s, r)
    assert.equal(done.interaction.stateId, 'idle', JSON.stringify(done.interaction))
    assert.equal(done.state.currentPlayerIndex, 0)
    assert.equal(done.state.roundPhase, 'work')
    assert.equal(done.state.round, nextRound)
    return { pending, r: done }
  }
  const ROPE_SIX = ['grain-seeds', 'day-laborer', 'forest', 'grove', 'clay-pit', 'fishing']
  it("first natural harvest adds one reed only after feeding while ordinary return home adds none", () => {
    const harvest = end(setup(4), ROPE_SIX).r
    assert.equal(harvest.state.round, 5)
    assert.equal(harvest.state.players[0]!.resources.reed, 1)
    const ordinary = end(setup(3), ROPE_SIX).r
    assert.equal(ordinary.state.round, 4)
    assert.equal(ordinary.state.players[0]!.resources.reed, 0)
    const feedingSession = setup(4, state => { state.players[0]!.resources.food = 3 })
    const pending = endWork(feedingSession, ROPE_SIX)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'feed', JSON.stringify(pending.interaction))
    assert.equal(pending.interaction.promptKey, 'ui.harvestFeed')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.state.currentPlayerIndex, 0)
    assert.equal(pending.state.round, 4)
    assert.equal(pending.state.roundPhase, 'feeding')
    assert.equal(pending.interaction.request.remaining, 1)
    assert.equal(pending.interaction.request.foodUsed, 3)
    assert.deepEqual(pending.interaction, {
      stateId: 'wait', playerIndex: 0, spaceId: '__subflow:feed', promptKey: 'ui.harvestFeed', sourceCard: undefined, promptParams: undefined,
      request: {
        kind: 'feed', remaining: 1, foodUsed: 3, feedQueue: [{ index: 1 }, { index: 2 }],
        exchangeCatalog: [
          { sourceId: '__basic__', exchangeIndex: 0, from: { grain: 1 }, to: { food: 1 }, max: undefined, fromFarmyard: undefined },
          { sourceId: '__basic__', exchangeIndex: 1, from: { vegetable: 1 }, to: { food: 1 }, max: undefined, fromFarmyard: undefined },
        ],
        maxTradeTimesBySourceId: {}, placedAnimals: { sheep: 0, boar: 0, cattle: 0 },
      },
      allowedCommands: ['resolveChoice'], anytimeActions: [],
    })
    assert.equal(pending.state.players[0]!.resources.grain, 1)
    assert.equal(pending.state.players[0]!.resources.reed, 0)
    assert.equal(pending.state.completedFeedingPhases, 0)
    assert.deepEqual(feedingSession.getState().interaction, pending.interaction)
    assert.equal(feedingSession.getState().state.players[0]!.resources.reed, 0)
    const fed = ok(feedingSession.resolveChoice(0, 'confirm', { selections: [{ sourceId: '__basic__', exchangeIndex: 0, count: 1 }] }))
    assert.equal(fed.interaction.stateId, 'idle')
    assert.equal(fed.state.currentPlayerIndex, 0)
    assert.equal(fed.state.roundPhase, 'work')
    assert.equal(fed.state.completedFeedingPhases, 1)
    assert.equal(fed.state.players[0]!.resources.grain, 0)
    assert.equal(fed.state.players[0]!.resources.begging, 0)
    assert.equal(fed.state.round, 5)
    assert.equal(fed.state.players[0]!.resources.reed, 1)
    assert.equal(feedingSession.getState().state.players[0]!.resources.reed, 1)
    save('A145-N1', { harvest, ordinary })
    save('A145-N1-feeding', { pending, fed })
  })
  it("repeated natural harvest grants once each and hand cannot grant reed", () => {
    const s = setup(7)
    const first = end(s, ROPE_SIX).r
    assert.equal(first.state.players[0]!.resources.reed, 1)
    assert.equal(s.getState().state.players[0]!.resources.reed, 1)
    const ordinary = end(s, ROPE_SIX).r
    assert.equal(ordinary.state.round, 9)
    assert.equal(ordinary.state.players[0]!.resources.reed, 1)
    assert.equal(ordinary.interaction.stateId, 'idle')
    const repeated = end(s, ROPE_SIX).r
    assert.equal(repeated.state.round, 10)
    assert.equal(repeated.state.roundPhase, 'work')
    assert.equal(repeated.interaction.stateId, 'idle')
    assert.equal(repeated.state.players[0]!.resources.reed, 2)
    assert.equal(s.getState().state.players[0]!.resources.reed, 2)
    const hand = end(setup(4, undefined, false), ROPE_SIX).r
    assert.equal(hand.state.players[0]!.resources.reed, 0)
    save('A145-N2', { first, ordinary, repeated, hand })
  })
})

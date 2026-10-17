import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A153_PigOwner'
import { type AnytimeAction, type GameState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A153_PigOwner'

describe('A153_PigOwner session', () => {
  const setup = (boar = 0) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.boar = boar
    if (boar > 0) {
      player.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({
        edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
      }))
      player.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 2 }], animalType: 'boar', animalCount: Math.min(boar, 4) }]
      player.stableTiles = [{ row: 0, col: 2 }]
      player.houseAnimals = boar > 4 ? { '1-0': 'boar' } : {}
    }
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 5 boar', () => {
    const session = setup(4)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })

  it('available with >= 5 boar, grants 3 VP', () => {
    const session = setup(5)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A153-pig-owner-anytime')

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.A153_PigOwner?.counters?.bonusVp).toBe(3)
  })

  it('not available after flagged (one-time)', () => {
    const session = setup(5)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })
})

describe('A153 Pig Owner parity', () => {
  const CARD_ID = 'A153_PigOwner'

  const ANYTIME_ID = 'A153-pig-owner-anytime'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, pigs = 0 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6153, options: { playerCount: 4 } }))
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
    })
    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.pastures = pigs > 0 ? [{ id: 'pig-owner-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'boar', animalCount: Math.min(pigs, 4) }] : []
    player.houseAnimals = pigs >= 5 ? { '1-0': 'boar' } : {}
    player.stableAnimals = {}
    player.stableTiles = pigs > 0 ? [{ row: 0, col: 2 }] : []
    player.fenceSegments = pigs > 0 ? ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })) : []
    player.resources.boar = pigs
    session.loadState(state)
    return session
  }

  const enterInteraction = (session: GameSession): SessionResponse => {
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    return response
  }

  const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
    .map((action) => action.id)

  it('A153 S2: four pigs on the farm do not provide the Pig Owner anytime action', () => {
    const response = enterInteraction(setup({ pigs: 4 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A153 S3: five pigs across pasture and house grant three bonus points', () => {
    const session = setup({ pigs: 5 })
    const entered = enterInteraction(session)
    expect(anytimeIds(entered)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A153 S4: Pig Owner can score only once', () => {
    const session = setup({ pigs: 5 })
    enterInteraction(session)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(3)
  })
})

describe("A153 command boundaries", () => {
  const PIG = 'A153_PigOwner', ANY = 'A153-pig-owner-anytime'
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
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const p = state.players[0]!
        p.occupationPlayed = played ? [PIG] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [PIG, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function pasture(state: GameState) {
    const p = state.players[0]!
    p.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))
    p.pastures = [{ id: 'housing', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
    p.stableTiles = [{ row: 0, col: 2 }]
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
    for (let n = 0; n < 18 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'animal-reorg')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { zones: i.request.zones }))
      else
        assert.fail(JSON.stringify(i))
    }
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function pig(count: number, played = true) {
    return setup(state => {
      pasture(state)
      const p = state.players[0]!
      p.resources.boar = count
      p.pastures[0]!.animalType = 'boar'
      p.pastures[0]!.animalCount = Math.min(count, 4)
      p.houseAnimals = count >= 5 ? { '2-0': 'boar' } : {}
    }, played)
  }
  function points(r: SessionResponse) {
    return r.state.players[0]!.cardStates[PIG]?.counters?.bonusVp ?? 0
  }
  function assertScoreAttribution(s: GameSession, response: SessionResponse, expected: 0 | 3) {
    const expectedEntries = expected === 0 ? [[], [], [], []] : [[{
      category: 'cardBonusVp', cardId: PIG, cardType: 'occupation', score: expected,
    }], [], [], []]
    for (const result of [response, s.getState()]) {
      assert.ok(result.scores)
      assert.deepEqual(result.scores.map(score => score.playerId), result.state.players.map(player => player.id))
      assert.deepEqual(result.scores.map(score => score.categories.flatMap(category => category.entries.flatMap(entry =>
        entry.type === 'bonus' && entry.cardId === PIG
          ? [{ category: category.key, cardId: entry.cardId, cardType: entry.cardType, score: entry.score }]
          : [],
      ))), expectedEntries)
      assert.deepEqual(result.scores.map(score => score.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0), [expected, 0, 0, 0])
    }
  }
  it("four farm pigs never unlock the three point reward", () => {
    const s = pig(4), r = finish(s, turn(s, 0, 'day-laborer'))
    assert.ok(!r.interaction.anytimeActions.some(a => a.id === ANY))
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))
    assert.equal(points(r), 0)
    assertScoreAttribution(s, r, 0)
    save('A153-N1', r)
  })
  it("five pigs across finite stable pasture and house award owner three points once", () => {
    const s = pig(5)
    const entered = finish(s, turn(s, 0, 'day-laborer'))
    assert.ok(entered.interaction.anytimeActions.some(a => a.id === ANY))
    assertScoreAttribution(s, entered, 0)
    const r = finish(s, ok(s.takeAnytimeAction(0, ANY)))
    assert.equal(points(r), 3)
    assertScoreAttribution(s, r, 3)
    assert.equal(isCardFlagged(r.state.players[0]!, PIG), true)
    assert.equal(r.state.players[0]!.resources.boar, 5)
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))
    assert.equal(points(s.getState()), 3)
    assertScoreAttribution(s, s.getState(), 3)
    save('A153-N2', { entered, r })
  })
  it("hand and actual wrong actor cannot claim five pig owner reward", () => {
    const hs = pig(5, false), hand = finish(hs, turn(hs, 0, 'day-laborer'))
    assert.ok(!hand.interaction.anytimeActions.some(a => a.id === ANY))
    assert.equal(points(hand), 0)
    assertScoreAttribution(hs, hand, 0)
    assert.equal(isCardFlagged(hand.state.players[0]!, PIG), false)
    const s = pig(5)
    finish(s, turn(s, 0, 'day-laborer'))
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(1, ANY))
    assertScoreAttribution(s, s.getState(), 0)
    const r = finish(s, ok(s.takeAnytimeAction(0, ANY)))
    assert.equal(points(r), 3)
    assertScoreAttribution(s, r, 3)
    save('A153-N3', { hand, r })
  })
})

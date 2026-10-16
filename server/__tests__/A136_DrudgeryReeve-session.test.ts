import { setWorkersAtHome, markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A136_DrudgeryReeve'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { type CardEffect } from '../../shared/cards/card-effects'
import { type PlayerState, type Resource, type GameState } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A136_DrudgeryReeve'
const RESERVE_FIRST_CARD = 'TEST_A136ReserveFirst'

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const setBuildingResources = (player: PlayerState, amount: number) => {
  player.resources.wood = amount
  player.resources.clay = amount
  player.resources.stone = amount
  player.resources.reed = amount
}

const setupEndGameSession = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    setPlaceholderHands(player)
    player.resources = {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  session.loadState(state)
  return session
}

const resolveA136TriggerIfPresent = (session: GameSession, resp: SessionResponse, playerIndex: number) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  if (interaction.request.kind !== 'select-trigger') return resp
  expect(interaction.request.kind).toBe('select-trigger')
  expect(getChoiceOptions({ interaction: interaction })).toContainEqual({
    value: CARD_ID,
    labelKey: `cards.${CARD_ID}.name`,
    sourceCard: CARD_ID,
  })
  expect(getChoiceOptions({ interaction: interaction })).toContainEqual({
    value: '__pass__',
    labelKey: 'ui.interactionSelectTriggerPass',
    disabled: true,
  })
  return session.resolveChoice(playerIndex, CARD_ID)
}

const expectA136Choice = (resp: SessionResponse, playerIndex: number, values: string[]) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('choice')
  if (interaction.request.kind !== 'choice') throw new Error('expected choice')
  expect(interaction.promptKey).toBe('ui.cards.A136_DrudgeryReeve.prompt')
  expect(getChoiceOptions({ interaction: interaction }).map((option) => option.value)).toEqual(values)
}

const a136Choice = (sets: number) => `${CARD_ID}:sets:${sets}`

describe('A136_DrudgeryReeve before-end shared scoring', () => {
  it('lets each target player choose sets from another player A136 and records reserve without spending resources', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    setBuildingResources(state.players[0]!, 2)
    setBuildingResources(state.players[1]!, 3)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveA136TriggerIfPresent(session, resp, 0)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1), a136Choice(2)])

    resp = session.resolveChoice(0, a136Choice(2))
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 2, clay: 2, reed: 2, stone: 2 },
      score: 3,
      cardType: 'occupation',
    })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    assert.ok(resp.interaction.stateId === 'wait')
    assert.ok(resp.interaction.request.kind === 'confirm-player-switch')
    expect(resp.interaction.request.fromPlayerIndex).toBe(0)
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    resp = resolveA136TriggerIfPresent(session, resp, 1)
    expectA136Choice(resp, 1, [
      a136Choice(0),
      a136Choice(1),
      a136Choice(2),
      a136Choice(3),
    ])

    resp = session.resolveChoice(1, a136Choice(3))
    expect(resp.state.players[1]!.resources.wood).toBe(3)
    expect(resp.state.players[1]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 3, clay: 3, reed: 3, stone: 3 },
      score: 5,
      cardType: 'occupation',
    })
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
    expect(resp.interaction.allowedCommands).toEqual([])

    const undoStep = session.undoStep()
    expect(undoStep.ok).toBe(false)
    expect(undoStep.ok ? '' : undoStep.error).toBe('game is over')
    expect(undoStep.state.gameOver).toBe(true)

    const undoAction = session.undoAction()
    expect(undoAction.ok).toBe(false)
    expect(undoAction.ok ? '' : undoAction.error).toBe('game is over')
    expect(undoAction.state.gameOver).toBe(true)

    const scores = session.withCtx(() => computeScores(resp.state))
    const p2Bonus = scores[1]!.categories.find((category) => category.key === 'cardBonusVp')
    expect(p2Bonus).toEqual(expect.objectContaining({
      total: 5,
      entries: [
        {
          type: 'bonus',
          score: 5,
          cardId: CARD_ID,
          cardType: 'occupation',
          reserved: { wood: 3, clay: 3, reed: 3, stone: 3 },
        },
      ],
    }))
  })

  it('skips players with no live sets and records no scoring reserve for choosing zero', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    setBuildingResources(state.players[0]!, 1)
    setBuildingResources(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveA136TriggerIfPresent(session, resp, 0)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1)])

    resp = session.resolveChoice(0, a136Choice(0))
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(resp.state.gameOver).toBe(true)
  })

  it('recomputes max sets after another before-end trigger reserves resources first', () => {
    const effect: CardEffect = {
      id: RESERVE_FIRST_CARD,
      onBeforeEndGame: (_state, player) => {
        if ((player.resources.wood ?? 0) <= 0) return
        return {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: RESERVE_FIRST_CARD,
          actionContext: { targetPlayerId: player.id },
          params: {
            kind: 'record-scoring-reserve-bonus',
            reserved: { wood: 1, clay: 1, stone: 1, reed: 1 } satisfies Partial<Resource>,
            score: 1,
            cardType: 'occupation',
          },
        }
      },
      beforeEndGameScope: 'allPlayers',
      beforeEndGameMandatory: true,
    }
    const session = setupEndGameSession()
    session.withCtx(() => requireActiveCardRegistry('A136 before-end recompute test').setEffect(effect))
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [RESERVE_FIRST_CARD, CARD_ID]
    setBuildingResources(state.players[0]!, 3)
    setBuildingResources(state.players[1]!, 0)
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    const interaction = resp.interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(interaction.request.kind).toBe('select-trigger')
    if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
    expect(getChoiceOptions({ interaction: interaction }).map((option) => option.value)).toEqual([
      RESERVE_FIRST_CARD,
      CARD_ID,
      '__pass__',
    ])

    resp = session.resolveChoice(0, RESERVE_FIRST_CARD)
    expect(resp.state.players[0]!.cardStates[RESERVE_FIRST_CARD]?.extraData?.scoringReserveBonus)
      .toEqual({
        reserved: { wood: 1, clay: 1, reed: 1, stone: 1 },
        score: 1,
        cardType: 'occupation',
      })

    resp = session.resolveChoice(0, CARD_ID)
    expectA136Choice(resp, 0, [a136Choice(0), a136Choice(1), a136Choice(2)])
  })
})

describe('A136 Drudgery Reeve parity', () => {
  const CARD_ID = 'A136_DrudgeryReeve'

  const FILLER = '__test_placeholder__'

  const setup = ({ round = 14, played = false } = {}) => {
    const session = sessionEvidence.track(new GameSession(6136 + round, undefined, { playerCount: 3 }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.gameOver = false
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
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

  it.each([
    { scenario: 'S1', round: 5, wood: 4 },
    { scenario: 'S2', round: 8, wood: 3 },
    { scenario: 'S3', round: 11, wood: 2 },
    { scenario: 'S4', round: 13, wood: 1 },
    { scenario: 'S5', round: 14, wood: 0 },
  ])('A136 $scenario: playing with the corresponding complete rounds left gains $wood wood',
    ({ round, wood }) => {
      const response = playOccupation(setup({ round }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(wood)
    })
})

describe("A136 command boundaries", () => {
  const CARD = 'A136_DrudgeryReeve'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(sets: number[], configure: (state: GameState) => void = () => {
  }, played = true, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = round
        for (const [i, p] of state.players.entries())
          Object.assign(p.resources, { food: 60, wood: sets[i] ?? 0, clay: sets[i] ?? 0, reed: sets[i] ?? 0, stone: sets[i] ?? 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [CARD] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
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
  function start(s: GameSession) {
    for (const [actor, space] of [[0, 'grain-seeds'], [1, 'forest'], [2, 'reed-bank'], [0, 'day-laborer'], [1, 'clay-pit'], [2, 'fishing']] as const)
      turn(s, actor, space)
    return advance(s, confirmNext(s, s.getState()))
  }
  function advance(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 24 && r.interaction.stateId === 'wait'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else if (i.request.kind === 'feed')
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
      else if (i.request.kind === 'select-trigger') {
        const o = getChoiceOptions({ interaction: i }).find(o => o.value === CARD)
        assert.ok(o)
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
      else if (i.request.kind === 'choice' && i.promptKey !== 'ui.cards.A136_DrudgeryReeve.prompt') {
        const o = getChoiceOptions({ interaction: i }).find(o => o.value === '__skip__' || o.value === '__done__')
        assert.ok(o, JSON.stringify(i))
        r = ok(s.resolveChoice(i.playerIndex, o.value))
      }
      else
        break
    }
    return r
  }
  function menu(r: SessionResponse, owner: number, max: number) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.equal(r.interaction.playerIndex, owner)
    assert.equal(r.interaction.promptKey, 'ui.cards.A136_DrudgeryReeve.prompt')
    assert.deepEqual(getChoiceOptions(r).map(o => o.value), Array.from({ length: max + 1 }, (_, i) => `${CARD}:sets:${i}`))
  }
  function choose(s: GameSession, r: SessionResponse, count: number) {
    assert.ok(r.interaction.stateId === 'wait')
    return advance(s, ok(s.resolveChoice(r.interaction.playerIndex, `${CARD}:sets:${count}`)))
  }
  function bonus(r: SessionResponse, owner: number) {
    assert.ok(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === CARD).reduce((n, e) => n + e.score, 0) ?? 0
  }
  it("real final harvest offers each target one two or three sets without spending reserves", () => {
    const s = setup([1, 2, 3])
    let r = start(s)
    const outputs = []
    for (const [owner, count, expected] of [[0, 1, 1], [1, 2, 3], [2, 3, 5]]) {
      menu(r, owner!, count!)
      const before = r.state.players[owner!]!.resources
      const snapshot = { wood: before.wood, clay: before.clay, reed: before.reed, stone: before.stone }
      r = choose(s, r, count!)
      assert.equal(bonus(r, owner!), expected)
      const p = r.state.players[owner!]!
      assert.deepEqual({ wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone }, snapshot)
      outputs.push(r)
    }
    assert.equal(r.interaction.stateId, 'gameover')
    sessionEvidence.record('A136-N1', outputs)
  })
  it("missing any one building resource suppresses sets and zero choice gives no bonus", () => {
    for (const missing of ['wood', 'clay', 'reed', 'stone'] as const) {
      const s = setup([2, 0, 0], state => state.players[0]!.resources[missing] = 0)
      let r = start(s)
      if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.cards.A136_DrudgeryReeve.prompt')
        r = choose(s, r, 0)
      assert.equal(bonus(r, 0), 0)
      sessionEvidence.record(`A136-N2-${missing}`, r)
    }
    const s = setup([2, 0, 0])
    let r = start(s)
    menu(r, 0, 2)
    r = choose(s, r, 0)
    assert.equal(bonus(r, 0), 0)
    assert.equal(r.state.players[0]!.cardStates[CARD]?.extraData?.scoringReserveBonus, undefined)
    sessionEvidence.record('A136-N2-zero', r)
  })
  it("negative excessive unknown and wrong actor choices reject before a legal selection", () => {
    const s = setup([1, 0, 0])
    let r = start(s)
    menu(r, 0, 1)
    for (const value of [`${CARD}:sets:-1`, `${CARD}:sets:2`, `${CARD}:sets:99`, 'unknown'])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, value))
    assertRejectedUnchanged(s, () => s.resolveChoice(1, `${CARD}:sets:1`))
    r = choose(s, r, 1)
    assert.equal(bonus(r, 0), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, `${CARD}:sets:1`))
    sessionEvidence.record('A136-N3', r)
  })
  it("another scoring reservation reduces max and cannot double count resource sets", () => {
    const s = setup([3, 0, 0], state => {
      const p = state.players[0]!
      p.cardStates['__test_previous_scoring_reservation__'] = { extraData: { scoringReserveBonus: { reserved: { wood: 2 }, score: 1, cardType: 'occupation' } } }
    })
    let r = start(s)
    menu(r, 0, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, `${CARD}:sets:2`))
    r = choose(s, r, 1)
    assert.equal(bonus(r, 0), 1)
    sessionEvidence.record('A136-N4', r)
  })
  it("unplayed card never offers shared scoring even with reserve sets", () => {
    const s = setup([1, 2, 3], undefined, false)
    const r = start(s)
    assert.equal(r.interaction.stateId, 'gameover')
    for (const i of [0, 1, 2])
      assert.equal(bonus(r, i), 0)
    sessionEvidence.record('A136-N5', r)
  })
  it("real play at remaining round thresholds gains exact wood once and undo permits retry", () => {
    for (const [left, wood] of [[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [8, 3], [9, 4]]) {
      const s = setup([0, 0, 0], undefined, false, 14 - left!)
      function play() {
        let r = turn(s, 0, 'lessons')
        if (!r.state.players[0]!.occupationPlayed.includes(CARD))
          r = ok(s.resolveChoice(0, CARD))
        return r
      }
      const first = play()
      assert.equal(first.state.players[0]!.resources.wood, wood)
      const undone = ok(s.undoAction())
      assert.equal(undone.state.players[0]!.resources.wood, 0)
      const retry = play()
      assert.equal(retry.state.players[0]!.resources.wood, wood)
      sessionEvidence.record(`A136-N6-${left}`, { first, undone, retry })
    }
  })
})

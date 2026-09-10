import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C133_Soldier'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

const CARD_ID = 'C133_Soldier'
const A136_ID = 'A136_DrudgeryReeve'
const JOINERY_ID = 'Major_Joinery'

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const setupEndGameSession = () => {
  const session = new GameSession()
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

const resolveSoldierTriggerIfPresent = (session: GameSession, resp: SessionResponse, playerIndex: number) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  if (interaction.request.kind !== 'select-trigger') return resp
  expect(interaction.request.kind).toBe('select-trigger')
  expect(interaction.request.options).toContainEqual({
    value: CARD_ID,
    labelKey: `cards.${CARD_ID}.name`,
    sourceCard: CARD_ID,
  })
  expect(interaction.request.options).toContainEqual({
    value: '__pass__',
    labelKey: 'ui.interactionSelectTriggerPass',
    disabled: true,
  })
  return session.resolveChoice(playerIndex, CARD_ID)
}

const expectSoldierChoice = (resp: SessionResponse, playerIndex: number, values: string[]) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('choice')
  if (interaction.request.kind !== 'choice') throw new Error('expected choice')
  expect(interaction.promptKey).toBe('ui.cards.C133_Soldier.prompt')
  expect(interaction.request.options.map((option) => option.value)).toEqual(values)
}

const soldierChoice = (pairs: number) => `${CARD_ID}:pairs:${pairs}`
const a136Choice = (sets: number) => `${A136_ID}:sets:${sets}`

describe('C133_Soldier before-end scoring choice', () => {
  it('lets the owner choose wood+stone pairs and records Scoring Reserve without spending resources', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    state.players[0]!.resources.wood = 4
    state.players[0]!.resources.stone = 2
    state.players[1]!.resources.wood = 5
    state.players[1]!.resources.stone = 5
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveSoldierTriggerIfPresent(session, resp, 0)
    expectSoldierChoice(resp, 0, [
      soldierChoice(0),
      soldierChoice(1),
      soldierChoice(2),
    ])

    resp = session.resolveChoice(0, soldierChoice(1))
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.stone).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 1, stone: 1 },
      score: 1,
      cardType: 'occupation',
    })
    expect(resp.state.players[1]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')

    const [score] = computeScores(resp.state)
    expect(score!.categories.find((category) => category.key === 'cardBonusVp')).toEqual(
      expect.objectContaining({
        total: 1,
        entries: [
          {
            type: 'bonus',
            score: 1,
            cardId: CARD_ID,
            cardType: 'occupation',
            reserved: { wood: 1, stone: 1 },
          },
        ],
      }),
    )
  })

  it('records no Soldier scoring state when the owner chooses zero pairs', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.resources.stone = 2
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    resp = resolveSoldierTriggerIfPresent(session, resp, 0)
    expectSoldierChoice(resp, 0, [
      soldierChoice(0),
      soldierChoice(1),
      soldierChoice(2),
    ])

    resp = session.resolveChoice(0, soldierChoice(0))
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(2)
    expect(resp.state.gameOver).toBe(true)

    const [score] = computeScores(resp.state)
    expect(score!.categories.find((category) => category.key === 'cardBonusVp')).toBeUndefined()
  })

  it('recomputes live pair options after an earlier Scoring Reserve choice and scores Joinery from remaining wood', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [A136_ID, CARD_ID]
    state.players[0]!.improvements = [JOINERY_ID]
    state.players[0]!.resources.wood = 6
    state.players[0]!.resources.clay = 1
    state.players[0]!.resources.stone = 3
    state.players[0]!.resources.reed = 1
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    let interaction = resp.interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(interaction.request.kind).toBe('select-trigger')
    if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
    expect(interaction.request.options.map((option) => option.value)).toEqual([
      A136_ID,
      CARD_ID,
      '__pass__',
    ])

    resp = session.resolveChoice(0, A136_ID)
    interaction = resp.interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(interaction.request.kind).toBe('choice')
    if (interaction.request.kind !== 'choice') throw new Error('expected choice')
    expect(interaction.request.options.map((option) => option.value)).toEqual([
      a136Choice(0),
      a136Choice(1),
    ])

    resp = session.resolveChoice(0, a136Choice(1))
    expect(resp.state.players[0]!.cardStates[A136_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 1, clay: 1, reed: 1, stone: 1 },
      score: 1,
      cardType: 'occupation',
    })

    interaction = resp.interaction
    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(interaction.request.kind).toBe('select-trigger')
    if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
    expect(interaction.request.options.map((option) => option.value)).toEqual([
      CARD_ID,
      '__pass__',
    ])

    resp = session.resolveChoice(0, CARD_ID)
    expectSoldierChoice(resp, 0, [
      soldierChoice(0),
      soldierChoice(1),
      soldierChoice(2),
    ])

    resp = session.resolveChoice(0, soldierChoice(2))
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.stone).toBe(3)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toEqual({
      reserved: { wood: 2, stone: 2 },
      score: 2,
      cardType: 'occupation',
    })
    expect(resp.state.gameOver).toBe(true)

    const [score] = computeScores(resp.state)
    expect(score!.categories.find((category) => category.key === 'cardBonusVp')).toEqual(
      expect.objectContaining({
        total: 4,
        entries: expect.arrayContaining([
          {
            type: 'bonus',
            score: 1,
            cardId: A136_ID,
            cardType: 'occupation',
            reserved: { wood: 1, clay: 1, reed: 1, stone: 1 },
          },
          {
            type: 'bonus',
            score: 2,
            cardId: CARD_ID,
            cardType: 'occupation',
            reserved: { wood: 2, stone: 2 },
          },
          {
            type: 'bonus',
            cardId: JOINERY_ID,
            cardType: 'major',
            score: 1,
          },
        ]),
      }),
    )
  })
})

describe('C133 Soldier parity', () => {
  const CARD_ID = 'C133_Soldier'

  const JOINERY_ID = 'Major_Joinery'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 0, stone = 0, joinery = false,
  } = {}) => {
    const session = new GameSession(6133, undefined, { playerCount: 3 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.gameOver = false
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setActiveWorkerCount(player, 0)
      setWorkersAtHome(state, player, 0)
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    owner.resources.stone = stone
    owner.improvements = joinery ? [JOINERY_ID] : []
    if (!played) {
      setActiveWorkerCount(owner, 2)
      setWorkersAtHome(state, owner, 2)
    }
    session.loadState(state)
    return session
  }

  const cardBonusEntries = (response: SessionResponse) =>
    computeScores(response.state)[0]!.categories
      .find((category) => category.key === 'cardBonusVp')?.entries ?? []

  it('C133 S5: without a complete wood and stone pair Soldier gives no scoring choice', () => {
    const response = setup({ wood: 3, stone: 0 }).invokeAfterRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.interaction.stateId).toBe('gameover')
    expect(cardBonusEntries(response).some((entry) => entry.cardId === CARD_ID)).toBe(false)
  })
})

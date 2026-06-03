import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

const CARD_ID = 'C133_Soldier'

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

const expectSoldierTrigger = (resp: SessionResponse, playerIndex: number) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('select-trigger')
  if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
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
    expectSoldierTrigger(resp, 0)

    resp = session.resolveChoice(0, CARD_ID)
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
    expectSoldierTrigger(resp, 0)

    resp = session.resolveChoice(0, CARD_ID)
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
})

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A142_Cordmaker'

const CARD_ID = 'A142_Cordmaker'
const FILLER = '__test_placeholder__'

const setup = ({ reed = 2, actor = 0, food = 0, played = true } = {}) => {
  const session = new GameSession(5142, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.reed = 0
    player.resources.grain = 0
    player.resources.vegetable = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
  if (!reedBank) throw new Error('reed-bank missing')
  reedBank.resources.reed = reed
  reedBank.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterCordmakerChoice = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const chooseReward = (
  session: GameSession,
  response: SessionResponse,
  resource: 'grain' | 'vegetable',
) => {
  response = enterCordmakerChoice(session, response)
  if (response.interaction.stateId !== 'wait') return response
  const reward = response.interaction.request.options?.find((option) =>
    option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.[resource] === 1)
  expect(reward, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, reward!.value)
  return response
}

describe('A142 Cordmaker parity', () => {
  it('A142 S1: Cordmaker is played as the first occupation without paying food in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A142 S2: owner taking at least two reed must choose and can gain one grain', () => {
    const session = setup()
    const response = session.takeAction(0, 'reed-bank')

    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, grain: 1, vegetable: 0 })
  })

  it('A142 S3: owner taking at least two reed can buy one vegetable for two food', () => {
    const session = setup({ food: 2 })
    const response = chooseReward(session, session.takeAction(0, 'reed-bank'), 'vegetable')

    // Characterize current OA behavior: the payment resolves, but the nested gain is skipped.
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0, grain: 0 })
  })

  it('A142 S4: without two food the owner can only choose grain', () => {
    const session = setup({ food: 1 })
    const response = enterCordmakerChoice(session, session.takeAction(0, 'reed-bank'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1, vegetable: 0 })
  })

  it('A142 S5: an opponent taking at least two reed lets the owner gain one grain', () => {
    const session = setup({ actor: 1 })
    const response = chooseReward(session, session.takeAction(1, 'reed-bank'), 'grain')

    expect(response.state.players[1]!.resources.reed).toBe(2)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('A142 S6: the owner can decline the reward triggered by an opponent', () => {
    const session = setup({ actor: 1, food: 2 })
    let response = enterCordmakerChoice(session, session.takeAction(1, 'reed-bank'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, vegetable: 0 })
  })

  it('A142 S7: taking fewer than two reed does not trigger Cordmaker', () => {
    const response = setup({ reed: 1 }).takeAction(0, 'reed-bank')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A142 S8: taking resources from another accumulation space does not trigger Cordmaker', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D137_TradeTeacher'
import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'D137_TradeTeacher'
const OTHER_OCCUPATION = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 4, playerCount = 3,
} = {}) => {
  const session = new GameSession(6137, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [OTHER_OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const takeLessons = (
  session: GameSession,
  spaceId = 'lessons',
  occupationId = OTHER_OCCUPATION,
) => {
  let response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(occupationId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const occupation = response.interaction.request.options?.find(
    (option) => option.value === occupationId,
  )
  expect(occupation, JSON.stringify(response.interaction)).toBeDefined()
  if (!occupation) return response
  response = session.resolveChoice(response.interaction.playerIndex, occupation.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

const tradeOptions = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? (response.interaction.request.options ?? []).filter(
      (option) => typeof option.labelParams?.goods === 'string',
    )
  : []

const enterTradeTeacherPurchase = (
  session: GameSession,
  initial: SessionResponse,
): SessionResponse => {
  let response = initial
  for (let depth = 0; depth < 3; depth += 1) {
    if (tradeOptions(response).length > 0) return response
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const trigger = response.interaction.request.options?.find(
      (option) => option.value !== '__skip__' && JSON.stringify(option).includes(CARD_ID),
    )
    expect(trigger).toBeDefined()
    if (!trigger) return response
    response = session.resolveChoice(response.interaction.playerIndex, trigger.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const buy = (
  session: GameSession,
  response: SessionResponse,
  goods: string,
) => {
  response = enterTradeTeacherPurchase(session, response)
  const option = tradeOptions(response).find(
    (candidate) => candidate.labelParams?.goods === goods,
  )
  expect(option).toBeDefined()
  if (!option || response.interaction.stateId !== 'wait') return response
  response = session.resolveChoice(response.interaction.playerIndex, option.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('D137 Trade Teacher parity', () => {
  it('D137 S1: playing Trade Teacher through Lessons immediately permits one purchase', () => {
    const session = setup({ played: false, food: 1 })
    let response = takeLessons(session, 'lessons', CARD_ID)
    response = buy(session, response, 'grain')

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })

  it('D137 S2: after regular Lessons one food buys one grain', () => {
    const session = setup({ food: 2 })
    let response = takeLessons(session)
    response = buy(session, response, 'grain')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })

  it('D137 S3: after regular Lessons two food buys one vegetable', () => {
    const session = setup({ food: 3 })
    let response = takeLessons(session)
    response = buy(session, response, 'vegetable')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
  })

  it('D137 S4: after regular Lessons three food buys two different goods', () => {
    const session = setup({ food: 4 })
    let response = takeLessons(session)
    response = buy(session, response, 'grain+vegetable')

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, grain: 1, vegetable: 1,
    })
  })

  it('D137 S5: the purchase after Lessons can be declined', () => {
    const session = setup({ food: 2 })
    let response = enterTradeTeacherPurchase(session, takeLessons(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 1, grain: 0, vegetable: 0,
    })
  })

  it('D137 S6: every offered selection contains distinct goods', () => {
    const session = setup({ food: 5 })
    let response = enterTradeTeacherPurchase(session, takeLessons(session))
    const options = tradeOptions(response)

    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      const goods = String(option.labelParams?.goods).split('+')
      expect(new Set(goods).size).toBe(goods.length)
    }
    const grain = options.find((option) => option.labelParams?.goods === 'grain')
    expect(grain).toBeDefined()
    if (grain && response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, grain.value)
    }
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D137 S7: no selection contains more than two goods and an unknown branch is rejected atomically', () => {
    const session = setup({ food: 5 })
    const response = enterTradeTeacherPurchase(session, takeLessons(session))
    const before = response.state.players[0]!.resources

    expect(tradeOptions(response).every((option) =>
      String(option.labelParams?.goods).split('+').length <= 2)).toBe(true)
    const rejected = session.resolveChoice(0, 'three-goods')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toEqual(before)
  })

  it('D137 S8: a non-Lessons action does not offer a purchase', () => {
    const response = setup({ food: 2 }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(tradeOptions(response)).toEqual([])
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })

  it('D137 S9: the four-player Lessons space also permits a purchase', () => {
    const session = setup({ food: 2, playerCount: 4 })
    let response = takeLessons(session, 'lessons-4')
    response = buy(session, response, 'grain')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })

  it('D137 S10: with no food after Lessons OA exposes no purchase branch', () => {
    const session = setup({ food: 1 })
    const response = takeLessons(session)

    expect(response.ok, response.error).toBe(true)
    expect(tradeOptions(response)).toEqual([])
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
  })
})

import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import '../../shared/cards/B/B021_HayloftBarn'
import '../../shared/cards/E/E142_Smuggler'

const CARD_ID = 'E142_Smuggler'
const HAYLOFT_BARN = 'B021_HayloftBarn'

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 1)
    markAllWorkersUsed(state, player)
    player.resources.food = 10
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorPlayed.push(HAYLOFT_BARN)
  player.cardStates[HAYLOFT_BARN] = {
    extraData: { foodCount: 2 },
    infobox: '2 Food',
  }
  player.resources.wood = 1
  player.resources.grain = 0
  player.resources.stone = 0

  session.loadState(state)
  return session
}

const exchangeOption = (
  resp: SessionResponse,
  resourcesPaid: Partial<Resource>,
  resourcesGained: Partial<Resource>,
): ActionChoiceOption => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected Smuggler choice')
  const option = resp.interaction.request.options?.find((entry) =>
    entry.sourceCard === CARD_ID
    && entry.effectPreview?.kind === 'resourceExchange'
    && JSON.stringify(entry.effectPreview.resourcesPaid) === JSON.stringify(resourcesPaid)
    && JSON.stringify(entry.effectPreview.resourcesGained) === JSON.stringify(resourcesGained)
  )
  expect(option).toBeDefined()
  return option!
}

describe('E142_Smuggler session', () => {
  it('chains wood to grain and the gained grain to stone as two exchanges', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    resp = session.resolveChoice(0, exchangeOption(resp, { wood: 1 }, { grain: 1 }).value)
    expect(resp.state.players[0]!.cardStates[HAYLOFT_BARN]?.extraData?.foodCount).toBe(1)
    resp = session.resolveChoice(0, exchangeOption(resp, { grain: 1 }, { stone: 1 }).value)

    const player = resp.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 0, grain: 0, stone: 1 })
    expect(resp.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toEqual([
      expect.objectContaining({ paid: { wood: 1 }, gained: { grain: 1 } }),
      expect.objectContaining({ paid: { grain: 1 }, gained: { stone: 1 } }),
    ])
  })

  it('allows passing both exchange stages', () => {
    const session = setup()
    let resp = session.performRoundEnd()

    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')
    expect(exchangeOption(resp, { wood: 1 }, { grain: 1 })).toBeDefined()
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0, stone: 0 })
    expect(resp.state.events.some((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID
    )).toBe(false)
  })
})

describe('E142 Smuggler parity', () => {
  const CARD_ID = 'E142_Smuggler'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 0, grain = 0, stone = 0,
  }: {
    played?: boolean
    wood?: number
    grain?: number
    stone?: number
  } = {}) => {
    const session = new GameSession(6142, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    Object.assign(owner.resources, { wood, grain, stone })
    if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const exchangeOption = (
    response: SessionResponse,
    resourcesPaid: Partial<Resource>,
    resourcesGained: Partial<Resource>,
  ): ActionChoiceOption => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Smuggler choice')
    const option = options(response).find((entry) =>
      entry.sourceCard === CARD_ID
      && entry.effectPreview?.kind === 'resourceExchange'
      && JSON.stringify(entry.effectPreview.resourcesPaid) === JSON.stringify(resourcesPaid)
      && JSON.stringify(entry.effectPreview.resourcesGained) === JSON.stringify(resourcesGained)
    )
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    return option!
  }

  const exchange = (
    session: GameSession, response: SessionResponse,
    resourcesPaid: Partial<Resource>, resourcesGained: Partial<Resource>,
  ) => session.resolveChoice(
    response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0,
    exchangeOption(response, resourcesPaid, resourcesGained).value,
  )

  it('E142 S4: both stages may perform wood-to-grain when two wood are available', () => {
    const session = setup({ wood: 2 })
    let response = session.performRoundEnd()
    response = exchange(session, response, { wood: 1 }, { grain: 1 })
    response = exchange(session, response, { wood: 1 }, { grain: 1 })

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2, stone: 0 })
  })

  it('E142 S5: without wood or grain Smuggler performs no exchange', () => {
    const response = setup().performRoundEnd()

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0, stone: 0 })
  })
})

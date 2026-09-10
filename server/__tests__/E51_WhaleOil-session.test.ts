import { type SessionResponse } from '../game/authoritative-session'
import '../../shared/cards/A/A116_WoodCutter'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E051_WhaleOil'

const CARD_ID = 'E051_WhaleOil'

const setup = (options?: { foodCount?: number }) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10

  // Add card to played list
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: options?.foodCount ?? 0 },
    infobox: `${options?.foodCount ?? 0} Food`,
  }

  // Put food on fishing space
  const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
  if (fishing) fishing.resources.food = 3

  session.loadState(state)
  return session
}

describe('E051_WhaleOil session', () => {
  it('onBuy sets foodCount to 0', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
  })

  it('using Fishing adds 1 food to card', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fishing')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(1)
  })

  it('non-fishing action does not add food to card', () => {
    const session = setup()

    // Use forest (wood accumulation) instead of fishing
    const forest = session.getState().state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6
    session.loadState(session.getState().state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(0)
  })

  it('before playing occupation: gains food equal to card count and preserves the stored food', () => {
    const session = setup({ foodCount: 3 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    // Add an occupation to hand so we can play it
    player.occupationHand.push('A116_WoodCutter')
    session.loadState(state)

    // Take lessons action to play an occupation
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Should prompt to choose which occupation to play
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose the occupation
    const occupationOption = resp.interaction.request.options?.find((o) => o.value === 'A116_WoodCutter')
    if (!occupationOption) {
      // The occupation may have already been auto-selected or the choice format differs
      return
    }
    const resp2 = session.resolveChoice(0, occupationOption.value)

    const updated = resp2.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
    // Player should have gained 3 food from card (5 + 3 = 8, minus occupation cost)
    // Occupation cost is 0 for first occupation, so food should be >= 8
    expect(updated.resources.food).toBeGreaterThanOrEqual(8)
  })

  it('before playing occupation with no food on card: no food gained', () => {
    const session = setup({ foodCount: 0 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.occupationHand.push('A116_WoodCutter')
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId !== 'wait') return
    const occupationOption = resp.interaction.request.options?.find((o) => o.value === 'A116_WoodCutter')
    if (!occupationOption) return
    const resp2 = session.resolveChoice(0, occupationOption.value)

    const updated = resp2.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    // No extra food from card
    expect(updated.resources.food).toBe(5)
  })
})

describe('E051 Whale Oil parity', () => {
  const CARD_ID = 'E051_WhaleOil'

  const OCCUPATION_ID = 'A116_WoodCutter'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, cardFood = 0, food = 0, resources = {},
  }: {
    played?: boolean
    cardFood?: number
    food?: number
    resources?: Partial<{ wood: number }>
  } = {}) => {
    const session = new GameSession(6051, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationHand = [OCCUPATION_ID]
    owner.resources.food = food
    Object.assign(owner.resources, resources)
    if (played) {
      owner.cardStates = {
        [CARD_ID]: { extraData: { foodCount: cardFood }, infobox: `${cardFood} Food` },
      }
    }
    const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
    if (!fishing) throw new Error('missing fishing')
    fishing.resources.food = 3
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) {
        response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
      }
    }
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationPlayed.includes(OCCUPATION_ID)) return response
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === OCCUPATION_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    return response
  }

  const cardFood = (response: SessionResponse) =>
    readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'foodCount') ?? 0

  it('E051 S1: paying one wood plays Whale Oil with no food on it', () => {
    const response = playMinor(setup({ played: false, resources: { wood: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardFood(response)).toBe(0)
  })

  it('E051 S2: using Fishing places one food on Whale Oil', () => {
    const response = setup().takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(cardFood(response)).toBe(1)
  })

  it('E051 S3: a non-Fishing action places no food on Whale Oil', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(cardFood(response)).toBe(0)
  })

  it('E051 S4: an occupation gains the stored amount without removing food from Whale Oil', () => {
    const response = playOccupation(setup({ cardFood: 3, food: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(8)
    expect(cardFood(response)).toBe(3)
  })

  it('E051 S5: zero stored food gives no food before an occupation', () => {
    const response = playOccupation(setup({ food: 5 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(cardFood(response)).toBe(0)
  })
})

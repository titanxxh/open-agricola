import { type SessionResponse } from '../game/authoritative-session'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/B/B048_ForestStone'

const CARD_ID = 'B048_ForestStone'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // ensure eastern-quarry is available (round 5+)

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.stone = 10

  // Manually add card to played list and trigger onBuy
  player.minorPlayed.push(CARD_ID)

  // Set up initial foodCount (simulating onBuy)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: 2 },
    infobox: '2 Food',
  }

  // Put some wood on the forest space so collect has resources
  const forest = state.actionSpaces.find((s) => s.id === 'forest')
  if (forest) forest.resources.wood = 6

  // Put some stone on an eastern-quarry space
  const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
  if (quarry) quarry.resources.stone = 3

  session.loadState(state)
  return session
}

describe('B048_ForestStone session', () => {
  it('onBuy sets foodCount to 2', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(2)
  })

  it('using a wood accumulation space releases 1 food from card', () => {
    const session = setup()
    const stateBefore = session.getState().state
    const foodBefore = stateBefore.players[0]!.resources.food

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const player = resp.state.players[0]!
    // foodCount should decrease from 2 to 1
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.counters?.foodCount).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.infobox).toBe('1 Food')
    // Player should have gained 1 food from card + 6 wood from forest
    expect(player.resources.food).toBe(foodBefore + 1)
    expect(player.resources.wood).toBeGreaterThan(10) // collected some wood
  })

  it('using a stone accumulation space adds 2 food to card', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const player = resp.state.players[0]!
    // foodCount should increase from 2 to 4
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(4)
    expect(player.cardStates?.[CARD_ID]?.counters?.foodCount).toBe(4)
    expect(player.cardStates?.[CARD_ID]?.infobox).toBe('4 Food')
  })

  it('does not release food when card is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Empty the card
    player.cardStates![CARD_ID]!.extraData!.foodCount = 0
    session.loadState(state)

    const foodBefore = state.players[0]!.resources.food
    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const updated = resp.state.players[0]!
    // No extra food from card
    expect(updated.resources.food).toBe(foodBefore)
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    expect(updated.cardStates?.[CARD_ID]?.infobox).toBe('2 Food')
  })

  it('wood then stone: releases 1, then adds 2', () => {
    const session = setup()

    // Use forest (wood) - releases 1 food, foodCount 2 -> 1
    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(1)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      resp = confirmNextPlayer(session)
      expect(resp.ok).toBe(true)
    }

    // Reset currentPlayerIndex so player 0 can act again in the same round
    const state2 = session.getState().state
    state2.currentPlayerIndex = 0
    const quarry = state2.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) {
      quarry.resources.stone = 3
      quarry.takenBy = []
    }
    session.loadState(state2)

    // Use eastern-quarry (stone) - adds 2 food, foodCount 1 -> 3
    resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(3)
  })
})

describe('B048 Forest Stone parity', () => {
  const CARD_ID = 'B048_ForestStone'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, round = 14, occupations = 1, wood = 0, stone = 0, storedFood = 2,
  } = {}) => {
    const session = new GameSession(6048, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = Array.from({ length: occupations }, () => FILLER)
    owner.resources = {
      ...owner.resources,
      wood, clay: 0, reed: 0, stone, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    if (played) {
      owner.cardStates[CARD_ID] = {
        extraData: { foodCount: storedFood },
        counters: { foodCount: storedFood },
        infobox: `${storedFood} Food`,
      }
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find((space) => space.id === 'eastern-quarry')!.resources.stone = 2
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === CARD_ID)
      if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    }
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(response)[0]
      expect(payment).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    }
    return response
  }

  const storedFood = (response: SessionResponse) =>
    readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'foodCount') ?? 0

  it('B048 S1: one occupation and two wood play Forest Stone with two food on it', () => {
    const response = playMinor(setup({ played: false, round: 5, wood: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(storedFood(response)).toBe(2)
  })

  it('B048 S2: Forest Stone may instead be played for one stone', () => {
    const response = playMinor(setup({ played: false, round: 5, stone: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(storedFood(response)).toBe(2)
  })

  it('B048 S3: without an occupation Forest Stone remains unavailable', () => {
    const response = enterMinor(setup({ played: false, round: 5, occupations: 0, wood: 2 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})

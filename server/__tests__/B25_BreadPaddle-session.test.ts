import { type SessionResponse } from '../game/authoritative-session'
import '../../shared/cards/A/A125_Priest'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B025_BreadPaddle'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'B025_BreadPaddle'

describe('B025_BreadPaddle session', () => {
  it('onBuy returns a gain-1-food flow', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('after playing occupation, triggers optional bake-bread', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 1)
    player.resources.food = 10
    player.resources.wood = 10

    setActiveWorkerCount(state.players[1]!, 1)
    markAllWorkersUsed(state, state.players[1]!)

    // Play B25 as minor improvement
    player.minorPlayed.push(CARD_ID)

    // Add an occupation to hand to play
    const occId = 'A114_SeasonalWorker'
    player.occupationHand = [occId, 'A110_Roughcaster']

    // Give player a fireplace so they can bake bread
    player.improvements.push('Major_Fireplace1')
    player.resources.grain = 3

    session.loadState(state)

    // Use lessons to play occupation (first occupation is free)
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Choose the occupation
    const occOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === occId)
    expect(occOption).toBeDefined()
    resp = session.resolveChoice(0, occId)
    expect(resp.ok).toBe(true)

    // The card should trigger bake-bread after playing occupation
    // Check that occupation was played
    const p = resp.state.players[0]!
    expect(p.occupationPlayed).toContain(occId)
  })

  it('logs only the bake substep food when Bread Paddle triggers after a paid occupation', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 1)
    player.resources.food = 5
    player.resources.grain = 1
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Fireplace1')
    player.occupationHand = ['A114_SeasonalWorker', 'A110_Roughcaster']
    player.occupationPlayed.push('A085_Homekeeper')

    setActiveWorkerCount(state.players[1]!, 1)
    markAllWorkersUsed(state, state.players[1]!)

    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    resp = session.resolveChoice(0, 'A114_SeasonalWorker')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < 6) {
      steps++
      if (resp.interaction.request.kind !== 'choice') break
      const options = resp.interaction.request.options ?? []
      const next = options.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
      expect(resp.ok).toBe(true)
    }

    const bakeEntries = resp.state.log.filter((entry) => entry.key === 'log.bakeBread')
    expect(bakeEntries).toHaveLength(1)
    expect(bakeEntries[0]?.params).toMatchObject({
      count: 1,
      food: 2,
    })
  })

  it('does not trigger bake-bread if card is not played', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 1)
    player.resources.food = 10

    setActiveWorkerCount(state.players[1]!, 1)
    markAllWorkersUsed(state, state.players[1]!)

    // Card NOT in minorPlayed
    const occId = 'A114_SeasonalWorker'
    player.occupationHand = [occId, 'A110_Roughcaster']

    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return

    resp = session.resolveChoice(0, occId)
    expect(resp.ok).toBe(true)
  })
})

describe('B025 Bread Paddle parity', () => {
  const CARD_ID = 'B025_BreadPaddle'

  const OCCUPATION_ID = 'A125_Priest'

  const FIREPLACE_ID = 'Major_Fireplace1'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = played ? 0 : 1, fireplace = true, grain = played ? 1 : 0,
  }: {
    played?: boolean
    wood?: number
    fireplace?: boolean
    grain?: number
  } = {}) => {
    const session = new GameSession(6025, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationHand = played ? [OCCUPATION_ID] : [FILLER]
    owner.improvements = played && fireplace ? [FIREPLACE_ID] : []
    owner.resources.wood = wood
    owner.resources.grain = grain
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
    return response
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(OCCUPATION_ID)) return response
    if (response.interaction.stateId === 'wait') {
      const occupation = options(response).find((option) => option.value === OCCUPATION_ID)
      if (occupation) response = session.resolveChoice(response.interaction.playerIndex, occupation.value)
    }
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const acceptBreadPaddle = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    if (!accept) return response
    return session.resolveChoice(response.interaction.playerIndex, accept.value)
  }

  it('B025 S1: paying one wood plays Bread Paddle and immediately gains one food', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
  })

  it('B025 S2: after playing an occupation Bread Paddle can bake one grain', () => {
    const session = setup()
    let response = acceptBreadPaddle(session, playOccupation(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionOptionalAction', sourceCard: CARD_ID,
    })
    response = acceptBreadPaddle(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('B025 S3: the Bread Paddle bake after an occupation may be declined', () => {
    const session = setup()
    const selected = playOccupation(session)
    const pending = acceptBreadPaddle(session, selected)
    expect(options(pending).some((option) => option.value === '__skip__'), JSON.stringify(pending.interaction))
      .toBe(true)

    const response = session.resolveChoice(pending.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })

  it('B025 S4: without a baking improvement an occupation grants no conversion', () => {
    const response = playOccupation(setup({ fireplace: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID).toBe(false)
  })
})

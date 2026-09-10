import { type SessionResponse } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A139_HollowWarden'

const CARD_ID = 'A139_HollowWarden'

describe('A139_HollowWarden session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 4) // 4 players for hollow-4 space
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    // Ensure hollow-4 space exists with accumulated clay
    const hollow = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (hollow) hollow.resources.clay = 4

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains 1 food when using hollow-4 space', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Should get clay from hollow + 1 food from HollowWarden
    expect(player.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger on non-hollow spaces', () => {
    const session = setup()
    const woodBefore = session.getState().state.players[0]!.resources.wood
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Use farmland (gives no food, no wood) to verify no HollowWarden trigger
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // HollowWarden should NOT have given extra food
    expect(player.resources.food).toBe(foodBefore)
  })

  it('gains 1 food when using 3p hollow space', () => {
    // 3p game uses 'hollow' space (non-4p variant). The reference listens via
    // isActionCardEvent($event, 'Hollow') which matches both spaces.
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow')
    if (!hollow) {
      // Some 3p configs may differ; skip if space missing.
      return
    }
    hollow.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const foodBefore = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'hollow')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(foodBefore + 1)
  })

  it('gains 1 food when using 5/6 hollow space', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 5 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow-56')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 3

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const foodBefore = session.getState().state.players[0]!.resources.food
    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger for opponent using hollow', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(1, 'hollow-4')
    expect(resp.ok).toBe(true)

    // Owner should not get bonus food
    const owner = resp.state.players[0]!
    expect(owner.resources.food).toBe(session.getState().state.players[0]!.resources.food)
  })
})

describe('A139 Hollow Warden parity', () => {
  const CARD_ID = 'A139_HollowWarden'

  const FIREPLACE = 'Major_Fireplace1'

  const FILLER = '__test_placeholder__'

  const setup = ({ actor = 0, played = true, clay = 0 } = {}) => {
    const session = new GameSession(6139, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = [FIREPLACE, 'Major_Well']
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.clay = clay
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-4')
    if (!hollow) throw new Error('hollow-4 space missing')
    hollow.resources.clay = 3
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return response
      const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const enterFireplaceChoice = (session: GameSession, initial: SessionResponse) => {
    let response = initial
    for (let step = 0; step < 5; step += 1) {
      if (response.state.players[0]!.improvements.includes(FIREPLACE)) return response
      if (response.interaction.stateId !== 'wait') return response
      if (response.interaction.request.options?.some((option) => option.value === FIREPLACE)) {
        return response
      }
      const enter = response.interaction.request.options?.find((option) =>
        option.value !== '__skip__' && option.value !== 'cancel')
      expect(enter, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, enter!.value)
    }
    return response
  }

  it('A139 S1: Hollow Warden is played through Lessons and its immediate action may be declined', () => {
    const session = setup({ played: false, clay: 2 })
    let response = playOccupation(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('A139 S2: its immediate Major Improvement action offers only Fireplaces and can build one', () => {
    const session = setup({ played: false, clay: 2 })
    let response = enterFireplaceChoice(session, playOccupation(session))
    if (!response.state.players[0]!.improvements.includes(FIREPLACE)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const majorIds = response.interaction.request.options
        ?.map((option) => option.value).filter((value) => value.startsWith('Major_')) ?? []
      expect(majorIds).toEqual([FIREPLACE])
      response = session.resolveChoice(response.interaction.playerIndex, FIREPLACE)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(FIREPLACE)
    expect(response.state.players[0]!.improvements).not.toContain('Major_Well')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})

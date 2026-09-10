import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E152_BargainHunter'

const CARD_ID = 'E152_BargainHunter'
const MINOR_ID = 'E047_SyrupTap'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 1, minorCard = MINOR_ID as string | null, resources = {},
  travelingFood = 2,
} = {}) => {
  const session = new GameSession(6152, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    setWorkersAtHome(state, player, 2)
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = minorCard === null ? [FILLER] : [minorCard]
  Object.assign(owner.resources, resources)
  state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = travelingFood
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const startNextRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const acceptAndPlayMinor = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step += 1) {
    const card = optionsOf(response).find((option) => option.value === MINOR_ID)
    if (card) return session.resolveChoice(response.interaction.playerIndex, card.value)
    const accept = optionsOf(response).find((option) =>
      option.value !== '__skip__' && option.value !== '__pass__')
    if (!accept) break
    response = session.resolveChoice(response.interaction.playerIndex, accept.value)
  }
  return response
}

const travelingFood = (response: SessionResponse) =>
  response.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food

describe('E152 Bargain Hunter parity', () => {
  it('E152 S1: Bargain Hunter is played as the first occupation in a four-player game', () => {
    const session = setup({ played: false, food: 0, minorCard: null })
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait') {
      const card = optionsOf(response).find((option) => option.value === CARD_ID)
      if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E152 S2: at round start food moves to Traveling Players before buying a minor', () => {
    const session = setup({ resources: { wood: 1, stone: 1 } })

    const response = acceptAndPlayMinor(session, startNextRound(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 0, stone: 0,
    })
    expect(travelingFood(response)).toBe(4)
  })

  it('E152 S3: the round-start Bargain Hunter offer may be declined', () => {
    const session = setup({ resources: { wood: 1, stone: 1 } })
    let response = startNextRound(session)
    const skip = optionsOf(response).find((option) =>
      option.value === '__skip__' || option.value === '__pass__')
    expect(skip).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex : 0, skip!.value)

    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(travelingFood(response)).toBe(3)
  })

  it('E152 S4: without food Bargain Hunter has no round-start offer', () => {
    const response = startNextRound(setup({ food: 0, resources: { wood: 1, stone: 1 } }))

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
    expect(travelingFood(response)).toBe(3)
  })

  it('E152 S5: a placeholder-only minor hand still offers Bargain Hunter', () => {
    const response = startNextRound(setup({ minorCard: null }))

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(travelingFood(response)).toBe(3)
  })

  it('E152 S6: a blocked minor can undo both the food transfer and the attempted action', () => {
    const session = setup()
    const response = acceptAndPlayMinor(session, startNextRound(session))

    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(travelingFood(response)).toBe(4)
    expect(response.interaction.request.kind).toBe('engine-blocked')
    const undone = session.undoStep(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(1)
    expect(travelingFood(undone)).toBe(3)
  })
})

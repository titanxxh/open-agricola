import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A031_DebtSecurity'
import '../../shared/cards/E/E141_VegetableVendor'

const CARD_ID = 'E141_VegetableVendor'
const MINOR_ID = 'A031_DebtSecurity'
const MAJOR_ID = 'Major_Fireplace1'
const FILLER = '__test_placeholder__'

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, actor = 0, food = 2, clay = 2, withMinor = true,
}: {
  played?: boolean
  actor?: number
  food?: number
  clay?: number
  withMinor?: boolean
} = {}) => {
  const session = new GameSession(7141, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = [MAJOR_ID]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: index === actor ? clay : 0, reed: 0, stone: 0,
      food: index === actor ? food : 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (withMinor) state.players[actor]!.minorHand = [MINOR_ID]
  session.loadState(state)
  return session
}

const chooseCard = (
  session: GameSession, initial: SessionResponse, cardId: string, sourceCard?: string,
) => {
  let response = initial
  for (let step = 0; step < 10; step += 1) {
    const player = response.state.players[response.interaction.playerIndex] ?? response.state.players[0]!
    if (player.minorPlayed.includes(cardId)
      || player.occupationPlayed.includes(cardId)
      || player.improvements.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const options = optionsOf(response)
    const choice = options.find((option) => option.value === cardId)
      ?? options.find((option) => option.value.startsWith('action-improvement-'))
      ?? options.find((option) => sourceCard
        && (option.sourceCard === sourceCard || option.value === sourceCard)
        && option.value !== '__skip__')
    if (!choice) return response
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const playVegetableVendor = (session: GameSession) =>
  chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)

const useVegetableSeedsAndBuild = (session: GameSession, cardId: string) =>
  chooseCard(session, session.takeAction(0, 'vegetable-seeds'), cardId, CARD_ID)

const declineVegetableVendor = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = optionsOf(response).find((option) =>
      option.sourceCard === CARD_ID || option.value === CARD_ID)
    expect(trigger, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, trigger!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const skip = optionsOf(response).find((option) => option.value === '__skip__')
  expect(skip, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, skip!.value)
}

describe('E141 Vegetable Vendor parity', () => {
  it('E141 S1: Vegetable Vendor can be played as the first occupation in a three-player game', () => {
    const response = playVegetableVendor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('E141 S2: Major Improvement grants one vegetable and still builds the selected major', () => {
    const session = setup()

    const response = chooseCard(session, session.takeAction(0, 'major-improvement'), MAJOR_ID, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, clay: 0 })
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
  })

  it('E141 S3: Vegetable Seeds grants its vegetable and an optional minor-improvement action', () => {
    const session = setup()

    const response = useVegetableSeedsAndBuild(session, MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 0 })
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
  })

  it('E141 S4: Vegetable Seeds optional improvement can build a major improvement', () => {
    const session = setup({ withMinor: false })

    const response = useVegetableSeedsAndBuild(session, MAJOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, clay: 0 })
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
  })

  it('E141 S5: declining the Vegetable Seeds improvement still gains the space vegetable', () => {
    const session = setup()

    const response = declineVegetableVendor(session, session.takeAction(0, 'vegetable-seeds'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('E141 S6: another action space grants neither a vegetable nor an improvement action', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 0
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
    expect(response.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
    ]))
  })

  it('E141 S7: an opponent using Vegetable Seeds does not trigger the owners Vegetable Vendor', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[1]!.resources.vegetable).toBe(1)
    expect(response.state.players[1]!.minorHand).toContain(MINOR_ID)
  })
})

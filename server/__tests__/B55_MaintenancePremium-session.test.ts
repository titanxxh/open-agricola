import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B55_MaintenancePremium'

const CARD_ID = 'B55_MaintenancePremium'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.clay = 10
  player.resources.reed = 10
  player.resources.stone = 10

  // Manually add card
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: 3 },
    infobox: '3 Food',
  }

  // Put wood on forest space
  const forest = state.actionSpaces.find((s) => s.id === 'forest')
  if (forest) forest.resources.wood = 6

  session.loadState(state)
  return session
}

describe('B55_MaintenancePremium session', () => {
  it('onBuy sets foodCount to 3', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
  })

  it('using wood accumulation space releases 1 food from card', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(2)
    expect(player.resources.food).toBe(foodBefore + 1)
  })

  it('does not release food when card is empty', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.extraData!.foodCount = 0
    session.loadState(state)

    const foodBefore = state.players[0]!.resources.food
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(0)
  })

  it('renovation restocks foodCount to 3', () => {
    const session = setup()

    // Deplete foodCount first
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.extraData!.foodCount = 0
    // Set round to when house-redevelopment is available
    state.round = 6
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 2
    player.resources.clay = 10
    player.resources.reed = 10
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    // Take house-redevelopment action (renovation + minor improvement)
    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    // After renovation, foodCount should be restocked to 3
    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
  })
})

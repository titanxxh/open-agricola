import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B48_ForestStone'

const CARD_ID = 'B48_ForestStone'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // ensure eastern-quarry is available (round 5+)

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.stone = 10

  // Manually add card to played list and trigger onBuy
  player.minorPlayed.push(CARD_ID)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`minor:${CARD_ID}`)

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

describe('B48_ForestStone session', () => {
  it('onBuy sets foodCount to 2', () => {
    const session = new GameSession()
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

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // foodCount should decrease from 2 to 1
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(1)
    // Player should have gained 1 food from card + 6 wood from forest
    expect(player.resources.food).toBe(foodBefore + 1)
    expect(player.resources.wood).toBeGreaterThan(10) // collected some wood
  })

  it('using a stone accumulation space adds 2 food to card', () => {
    const session = setup()

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // foodCount should increase from 2 to 4
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(4)
  })

  it('does not release food when card is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Empty the card
    player.cardStates![CARD_ID]!.extraData!.foodCount = 0
    session.loadState(state)

    const foodBefore = state.players[0]!.resources.food
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // No extra food from card
    expect(updated.resources.food).toBe(foodBefore)
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
  })

  it('wood then stone: releases 1, then adds 2', () => {
    const session = setup()

    // Use forest (wood) - releases 1 food, foodCount 2 -> 1
    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(1)

    // Switch to player 1 taking a turn, then back to player 0
    const state2 = session.getState().state
    state2.currentPlayerIndex = 0
    const p0 = state2.players[0]!
    p0.workersAvailable = 1
    // Put stone on quarry
    const quarry = state2.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) {
      quarry.resources.stone = 3
      quarry.takenBy = []
    }
    session.loadState(state2)

    // Use eastern-quarry (stone) - adds 2 food, foodCount 1 -> 3
    resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(3)
  })
})

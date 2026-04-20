import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E140_Carter'

const CARD_ID = 'E140_Carter'

describe('E140_Carter session', () => {
  const setup = (buyRound = 1) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = buyRound

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Manually trigger onBuy
    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    session.loadState(state)
    return session
  }

  it('onBuy sets triggerRound to round + 1', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    expect(triggerRound).toBe(4)
  })

  it('collecting building resources during trigger round grants food', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 2

    // Set up forest (wood accumulation space)
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    expect(forest).toBeDefined()
    if (forest) {
      forest.resources.wood = 3
    }
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // Player should get 3 wood + 3 food (1 food per building resource taken)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })

  it('does not trigger outside trigger round', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 3 // not trigger round

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) {
      forest.resources.wood = 3
    }
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // No extra food
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger for non-building-resource spaces', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 2

    state.players[0]!.resources.food = 0
    session.loadState(state)

    // Day laborer gives food, not building resources
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Only the day laborer food (2 food), no Carter bonus
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })
})

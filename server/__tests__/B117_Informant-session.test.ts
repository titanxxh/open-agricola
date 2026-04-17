import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/B/B117_Informant'

const CARD_ID = 'B117_Informant'

describe('B117_Informant session', () => {
  it('onBuy returns a gain-1-wood flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).params?.wood).toBe(1)
  })

  it('onBeforeReturnHome gives 1 wood when stone > clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 5
    player.resources.clay = 2
    player.resources.wood = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).params?.wood).toBe(1)
  })

  it('onBeforeReturnHome does not trigger when stone <= clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 3
    player.resources.clay = 3 // equal, not strictly greater
    player.resources.wood = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when stone < clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    player.resources.clay = 5
    player.resources.wood = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('integration: end of work phase gives wood when stone > clay', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.stone = 4
    player.resources.clay = 1
    player.resources.wood = 3

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through any pending choices
    let safety = 30
    while (safety-- > 0 && resp.pending.type !== 'none') {
      if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: any) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else if (resp.pending.type === 'animalReorg') {
        resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones)
      } else {
        break
      }
    }

    // After round end, Informant should have given 1 wood during return home phase
    expect(resp.state.players[0]!.resources.wood).toBe(3 + 1)
  })
})

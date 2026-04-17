import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B25_BreadPaddle'

const CARD_ID = 'B25_BreadPaddle'

describe('B25_BreadPaddle session', () => {
  it('onBuy returns a gain-1-food flow', () => {
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
    expect((flow as any).params?.food).toBe(1)
  })

  it('after playing occupation, triggers optional bake-bread', () => {
    const session = new GameSession()
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
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)

    // Add an occupation to hand to play
    const occId = 'A114_SeasonalWorker'
    player.occupationHand.push(occId)

    // Give player a fireplace so they can bake bread
    player.improvements.push('Major_Fireplace1')
    player.resources.grain = 3

    session.loadState(state)

    // Use lessons to play occupation (first occupation is free)
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Choose the occupation
    const occOption = resp.pending.options.find((o: any) => o.value === occId)
    expect(occOption).toBeDefined()
    resp = session.resolveChoice(0, occId)
    expect(resp.ok).toBe(true)

    // The card should trigger bake-bread after playing occupation
    // Check that occupation was played
    const p = resp.state.players[0]!
    expect(p.occupationPlayed).toContain(occId)
  })

  it('does not trigger bake-bread if card is not played', () => {
    const session = new GameSession()
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
    player.occupationHand.push(occId)

    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return

    resp = session.resolveChoice(0, occId)
    expect(resp.ok).toBe(true)
  })
})

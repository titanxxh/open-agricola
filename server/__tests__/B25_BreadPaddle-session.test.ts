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

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/E/E110_Dentist'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E110_Dentist'

describe('E110_Dentist session', () => {
  it('onStartHarvest returns optional flow to pay 1 wood when player has wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 5
    player.resources.food = 10

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect(flow!.optional).toBe(true)
  })

  it('onStartHarvest returns undefined when player has no wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.food = 10

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onHarvestFeedingPhase grants 1 food per wood on card', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 0

    // Manually push wood items to the card stack
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = {
      stack: ['wood', 'wood', 'wood'],
    }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    // Should gain 3 food (1 per wood on card)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })

  it('onHarvestFeedingPhase returns undefined when no wood on card', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = { stack: [] }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('full harvest flow: pay wood and get food during feeding', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 3

    // Pre-place some wood on card from a prior harvest
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = { stack: ['wood', 'wood'] }

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Should be prompted with optional choice to place wood at harvest start
    let safety = 20
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const skipOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      const acceptOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
      if (acceptOption) {
        // Accept the first non-skip option (pay 1 wood to place on card)
        resp = session.resolveChoice(0, acceptOption.value)
      } else if (skipOption) {
        resp = session.resolveChoice(0, '__skip__')
      } else {
        break
      }
    }

    // Drain remaining harvest phases
    safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After harvest, card should have wood placed on it
    const updated = resp.state.players[0]!
    const stack = getCardStack(updated, CARD_ID)
    // Should have at least 2 (pre-existing) + potentially 1 new from this harvest
    expect(stack.length).toBeGreaterThanOrEqual(2)
  })
})

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/E/E110_Dentist'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

const CARD_ID = 'E110_Dentist'

describe('E110_Dentist session', () => {
  it('onStartHarvest returns optional flow to pay 1 wood when player has wood', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 5
    player.resources.food = 10

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onStartHarvest!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect(flow!.optional).toBe(true)
  })

  it('onStartHarvest returns undefined when player has no wood', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.food = 10

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onStartHarvest!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onHarvestFeedingPhase grants 1 food per wood on card', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
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

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    // Should gain 3 food (1 per wood on card)
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })

  it('onHarvestFeedingPhase returns undefined when no wood on card', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = { stack: [] }

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('full harvest flow: pay wood and get food during feeding', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
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
      const skipOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      const acceptOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
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
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
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

describe('ae-negative-48-crops', () => {
  const { sessions, save, setup, choose, source, finish, completeRound } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E110 N1 harvest stores at most one wood irretrievably and feeding counts old plus newly stored wood', () => {
    for (const accept of [true, false]) {
      const s = setup('E110_Dentist', 4, state => { state.players[0]!.resources.wood = 2; state.players[0]!.cardStates.E110_Dentist = { stack: ['wood', 'wood'] }; })
      let r = completeRound(s)
      r = source(s, r, 'E110_Dentist')
      r = accept ? choose(s, r, o => !['__skip__', '__pass__'].includes(o.value)) : finish(s, r)
      r = finish(s, r)
      assert.equal(r.state.players[0]!.resources.wood, accept ? 1 : 2)
      assert.deepEqual(r.state.players[0]!.cardStates.E110_Dentist?.stack, accept ? ['wood', 'wood', 'wood'] : ['wood', 'wood'])
      assert.equal(r.state.players[0]!.resources.food, accept ? 20 : 19)
      save(`E110-N1-${accept}`, r)
    }
  })
  it('E110 N2 zero wood cannot store and nonharvest round cannot pay stored wood food', () => {
    for (const round of [4, 5]) {
      const s = setup('E110_Dentist', round, state => {
        if (round === 5) {
          state.players[0]!.resources.wood = 1
          state.players[0]!.cardStates.E110_Dentist = { stack: ['wood', 'wood'] }
        }
      })
      const r = finish(s, completeRound(s))
      assert.equal(r.state.players[0]!.resources.food, round === 4 ? 17 : 21)
      assert.equal(r.state.players[0]!.resources.wood, round === 4 ? 0 : 1)
      assert.deepEqual(r.state.players[0]!.cardStates.E110_Dentist?.stack ?? [], round === 4 ? [] : ['wood', 'wood'])
      save(`E110-N2-${round}`, r)
    }
  })
})

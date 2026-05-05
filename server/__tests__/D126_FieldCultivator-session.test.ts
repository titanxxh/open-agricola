import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/D/D126_FieldCultivator'

const CARD_ID = 'D126_FieldCultivator'

describe('D126_FieldCultivator session', () => {
  const setup = (options?: {
    fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Simulate onBuy: push stack
    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    if (options?.fields) {
      player.fields = options.fields
    }

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onBuy places 7 goods on stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack).toEqual(['wood', 'clay', 'reed', 'stone', 'reed', 'clay', 'wood'])
    expect(stack.length).toBe(7)
  })

  it('harvesting 2 fields pops 2 goods from stack', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    })

    const stateBefore = session.getState().state
    const woodBefore = stateBefore.players[0]!.resources.wood
    const clayBefore = stateBefore.players[0]!.resources.clay

    let resp = session.performRoundEnd()

    // Walk through any pending states (harvestFeed, etc.)
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    // 7 - 2 = 5 remaining
    expect(stack.length).toBe(5)
    // Top 2 popped were 'wood' and 'clay' (popped from top)
    // wood was on top, then clay
    expect(player.resources.wood).toBeGreaterThanOrEqual(woodBefore + 1)
    expect(player.resources.clay).toBeGreaterThanOrEqual(clayBefore + 1)
  })

  it('no pop when no fields are harvested', () => {
    const session = setup({
      fields: [],
    })

    let resp = session.performRoundEnd()
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(7) // unchanged
  })

  it('no pop when stack is empty', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      ],
    })

    // Empty the stack
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.stack = []
    session.loadState(state)

    let resp = session.performRoundEnd()
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    expect(stack.length).toBe(0)
  })

  it('pops only up to stack size when more fields are harvested', () => {
    const session = setup({
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      ],
    })

    // Set stack to only 2 items
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.stack = ['stone', 'reed']
    session.loadState(state)

    let resp = session.performRoundEnd()
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    const stack = getCardStack(player, CARD_ID)
    // 3 fields harvested but only 2 items on stack, so both popped
    expect(stack.length).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/B/B58_CrackWeeder'
import type { ActionChoiceOption } from '../../shared/game/types'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'B58_CrackWeeder'

describe('B58_CrackWeeder session', () => {
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
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('onAfterReap gives 1 food per vegetable field harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // Simulate 2 vegetable fields harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 2 }, grainFields: 0, vegetableFields: 2 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('onAfterReap does not trigger when no vegetable fields harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // Only grain fields harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 3 }, grainFields: 3, vegetableFields: 0 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })


  it('integration: harvest with vegetable fields gives food bonus', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 10
    // Vegetable field with remaining=1 — will be harvested
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
      } else if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.pending.type === 'choice') {
        const skipOpt = resp.pending.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.pending.playerIndex ?? 0, resp.pending.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After harvest, player should have gained 1 vegetable from reaping + 1 food from CrackWeeder
    // Started with 10 food, gained 1 from card, paid 2 for feeding (1 family member)
    const p = resp.state.players[0]!
    expect(p.resources.food).toBe(10 + 1 - 2)
  })
})

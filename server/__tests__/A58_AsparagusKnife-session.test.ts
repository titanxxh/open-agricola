import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/A/A058_AsparagusKnife'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

const CARD_ID = 'A058_AsparagusKnife'

describe('A058_AsparagusKnife session', () => {
  const setupForReturnHome = (options: {
    round: number
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
    grainFields?: { row: number; col: number; crop: 'grain'; remaining: number }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options.round

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    player.fields = [
      ...(options.vegetableFields ?? []),
      ...(options.grainFields ?? []),
    ]

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  // --- Direct hook tests ---

  it('triggers in round 8 with vegetable fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 8
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    // Field should NOT be decremented yet (waiting for player interaction)
    expect(player.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('triggers in round 10', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 10
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeDefined()
    // Field should NOT be modified yet
    expect(player.fields[0]!.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('triggers in round 12', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 12
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeDefined()
  })

  it('does NOT trigger in non-trigger rounds (e.g. round 7)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 7
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('does NOT trigger in round 9', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 9
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('does NOT trigger when no vegetable fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 8
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })


  it('returns seq flow with selection for multiple vegetable fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 8
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    // Neither field should be decremented yet (waiting for player choice)
    expect(player.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
    expect(player.fields[1]!.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('does NOT trigger when vegetable field has remaining=0', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 8
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [] },
    ]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  // --- Integration tests ---

  it('integration: round 8 with 1 veg field — accept gives 3 food + 1 bonus VP', () => {
    const session = setupForReturnHome({
      round: 8, // round 8 is NOT a harvest round, just return home
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ],
    })

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) => {
        const skipOption = intx.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        const acceptOption = intx.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
        if (skipOption && acceptOption) {
          return sess.resolveChoice(intx.playerIndex, acceptOption.value)
        }
        if (intx.promptKey === 'ui.interactionSelection') {
          return sess.commitSelectionChoice(intx.playerIndex, { positions: [{ row: 0, col: 0 }] })
        }
        return sess.resolveChoice(intx.playerIndex, intx.options?.[0]?.value ?? 'ok')
      },
    })

    const player = session.getState().state.players[0]!
    // Vegetable field: had remaining=2, 1 taken by card → remaining=1
    const vegField = player.fields.find((f) => f.row === 0 && f.col === 0)
    expect(vegField?.stacks[0]?.remaining ?? 0).toBe(1)
    // Food: +3 from card effect
    // Round 8 is NOT a harvest round, so no feeding
    expect(player.resources.food).toBeGreaterThanOrEqual(13) // 10 + 3
    // Bonus VP: check bonusVp counter
    expect(player.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('integration: player can decline the optional effect', () => {
    const session = setupForReturnHome({
      round: 8,
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ],
    })

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) => {
        const skipOption = intx.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOption) {
          return sess.resolveChoice(intx.playerIndex, skipOption.value)
        }
        return sess.resolveChoice(intx.playerIndex, intx.options?.[0]?.value ?? 'ok')
      },
    })

    const player = session.getState().state.players[0]!
    // Vegetable field should be untouched (no card effect)
    const vegField = player.fields.find((f) => f.row === 0 && f.col === 0)
    expect(vegField?.stacks[0]?.remaining ?? 0).toBe(2)
    // No food bonus
    expect(player.resources.food).toBe(10)
  })

  it('integration: does NOT trigger in non-trigger round (round 7 harvest)', () => {
    const session = setupForReturnHome({
      round: 7, // harvest round but not a trigger round for this card
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ],
    })

    const foodBefore = session.getState().state.players[0]!.resources.food

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) =>
        sess.resolveChoice(intx.playerIndex, 'ok'),
    })

    const player = session.getState().state.players[0]!
    // Vegetable field should have been harvested normally (remaining 2→1)
    const vegField = player.fields.find((f) => f.row === 0 && f.col === 0)
    expect(vegField?.stacks[0]?.remaining ?? 0).toBe(1)
    // Food: -2 from feeding (1 family member)
    expect(player.resources.food).toBe(foodBefore - 2)
  })
})

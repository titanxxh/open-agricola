import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C063_CraftBrewery'
import '../../shared/cards/B/B113_PatchCaregiver'

describe('C063_CraftBrewery session (verify-only)', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((candidate) => {
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
    })
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C063_CraftBrewery')
    player.fields = []
    return { session, state, player }
  }

  it('returns optional seq with field selection + pay/gain when supply has grain and one field has grain', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    expect(seq.children.map((c) => (c as Extract<ActionFlow, { type: 'leaf' }>).actionId)).toEqual([
      'selection',
      'pay',
      'gain',
      'bonus-vp',
      'bonus-vp',
    ])
    const selection = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(selection.actionId).toBe('selection')
    expect(selection.sourceCard).toBe('C063_CraftBrewery')
    expect(selection.actionContext).toMatchObject({
      selectionKind: 'farm-position',
      selectableTiles: [{ row: 1, col: 0 }],
      minSelections: 1,
      maxSelections: 1,
    })
    const pay = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(pay.params).toEqual({ grain: 1 })
    const gain = seq.children[2] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gain.params).toEqual({ food: 4 })

    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
  })

  it('selects grain from a Card Field through the Logical Field mutation seam', () => {
    const { state, player } = setup()
    player.resources.grain = 2
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }

    const flow = runCardEffectHook(state, player, 'C063_CraftBrewery', 'onHarvestFeedingPhase')
    const selection = flow?.type === 'seq' ? flow.children[0] : undefined
    expect(selection).toMatchObject({
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles: [expect.objectContaining({ row: -1, col: 2113 })],
        minSelections: 1,
        maxSelections: 1,
        selectionEffect: 'c63-craft-brewery-remove-grain',
      },
    })

    runSelectionEffect('c63-craft-brewery-remove-grain', {
      state,
      player,
      positions: ['-1-2113'],
      cards: [],
      sourceCard: 'C063_CraftBrewery',
    })

    expect(player.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
  })

  it('returns null when player has no grain in supply', () => {
    const { session, state, player } = setup()
    player.resources.grain = 0
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).toBeNull()
    // Field untouched.
    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
  })

  it('returns null when no grain field exists', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    // Only a vegetable field — no grain anywhere.
    player.fields.push({
      stacks: [{ kind: 'vegetable', remaining: 2 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    )
    expect(flow).toBeNull()
  })

  it('settles field grain, supply grain, food, and two bonus points through harvest Session', () => {
    const session = new GameSession(7063, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    session.state.round = 4
    session.state.players.forEach((candidate) => {
      setActiveWorkerCount(candidate, 0)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.minorPlayed = []
      candidate.occupationPlayed = []
      candidate.cardStates = {}
      candidate.fields = []
      candidate.resources.food = 0
      candidate.resources.grain = 0
    })
    const player = session.state.players[0]!
    player.minorPlayed = ['C063_CraftBrewery']
    player.resources.grain = 1
    player.fields = [{
      row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 2 }],
    }]
    session.loadState(session.state)

    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', sourceCard: 'C063_CraftBrewery', request: { kind: 'selection' },
    })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection') return
    const position = response.interaction.request.selection.selectablePositions[0]!
    response = session.commitSelectionChoice(0, { positions: [position] })
    expect(response.interaction.stateId, JSON.stringify(response.interaction, null, 2)).toBe('idle')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]?.remaining ?? 0).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 4 })
    expect(response.state.players[0]!.cardStates.C063_CraftBrewery?.counters?.bonusVp).toBe(2)
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.paid', sourceCardId: 'C063_CraftBrewery', resources: { grain: 1 } }),
      expect.objectContaining({ type: 'resource.moved', sourceCardId: 'C063_CraftBrewery', resources: { food: 4 } }),
    ]))
  })
})

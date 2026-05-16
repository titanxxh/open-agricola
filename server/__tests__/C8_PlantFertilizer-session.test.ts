import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { ActionFlow, CropStack } from '../../shared/contract/types'

import '../../shared/cards/C/C8_PlantFertilizer'
import '../../shared/cards/D/D75_WoodField'
import '../../shared/cards/E/E80_RockGarden'
import '../../shared/cards/A/A11_MudPatch'
import { A11_MudPatch_impl } from '../../shared/cards/A/A11_MudPatch'

const CARD_ID = 'C8_PlantFertilizer'

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  // Avoid random re-deal interference (CLAUDE.md "Session 测试里卡牌不要随机")
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  player.minorPlayed.push(CARD_ID)
  player.fields = []
  return { session, state, player }
}

describe('C8 PlantFertilizer session', () => {
  it('onBuy returns no flow when no field is eligible', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
    expect(player.fields[0]!.stacks).toEqual([])
  })

  it('onBuy produces optional-SEQ shape for 1-grain field', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).optional).toBe(true)
  })

  it('accept path: 1-grain field grows to 2 after SEQ executes', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children[0]! as Extract<ActionFlow, { type: 'leaf' }>

    // Invoke the special-effect action's execute directly. The project
    // does not expose a public flow runner on GameSession for tests
    // (only `takeAction` / `loadState` / `getState`); the leaf is pure
    // and synchronous, so direct execute is the honest minimal form.
    const result = specialEffectAction.execute!({
      state,
      player,
      sourceCard: leaf.sourceCard,
      params: leaf.params as Record<string, unknown>,
      space: undefined as never,
    })
    expect(result.type).toBe('ok')
    expect(player.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(player.resources.grain ?? 0).toBe(0)
  })

  it('decline path: rejecting the SEQ leaves state unchanged', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')!
    // Decline: we simply do NOT execute the leaf. The optional SEQ wrapper
    // allows the player to skip the whole effect.
    expect(player.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(player.resources.grain ?? 0).toBe(0)
    expect(player.minorPlayed.includes(CARD_ID)).toBe(true)
    // Sanity: shape is still optional, confirming the wrapper exposes a
    // decline affordance.
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).optional).toBe(true)
  })

  it('accept path multi-location: normal field + D75 both grow to 2', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.minorPlayed.push('D75_WoodField')
    player.cardStates['D75_WoodField'] = {
      extraData: { stacks: [{ kind: 'wood', remaining: 1 }] as CropStack[] },
    }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children[0]! as Extract<ActionFlow, { type: 'leaf' }>

    specialEffectAction.execute!({
      state,
      player,
      sourceCard: leaf.sourceCard,
      params: leaf.params as Record<string, unknown>,
      space: undefined as never,
    })

    expect(player.fields[0]!.stacks[0]!.remaining).toBe(2)
    const woodStacks = player.cardStates['D75_WoodField']!.extraData!['stacks'] as CropStack[]
    expect(woodStacks[0]!.remaining).toBe(2)
    expect(player.resources.grain ?? 0).toBe(0)
    expect(player.resources.wood ?? 0).toBe(0)
  })

  it('decline path multi-location: nothing changes', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.minorPlayed.push('D75_WoodField')
    player.cardStates['D75_WoodField'] = {
      extraData: { stacks: [{ kind: 'wood', remaining: 1 }] as CropStack[] },
    }
    session.loadState(state)

    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    expect(player.fields[0]!.stacks[0]!.remaining).toBe(1)
    const woodStacks = player.cardStates['D75_WoodField']!.extraData!['stacks'] as CropStack[]
    expect(woodStacks[0]!.remaining).toBe(1)
    expect(player.minorPlayed.includes(CARD_ID)).toBe(true)
  })

  it('A11 Mud Patch boar zone does NOT inject PIG into field.stacks (G6 invariant)', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.minorPlayed.push('A11_MudPatch')
    session.loadState(state)

    // Drive A11's onComputeAnimalZones — it should push a card-zone, NOT
    // mutate field.stacks. A11_MudPatch_impl is statically imported at
    // the top of the file (same convention used in other session tests
    // that need impl-level access, e.g. C6_StoneClearing-session test).
    const zones: Parameters<NonNullable<typeof A11_MudPatch_impl.effect.onComputeAnimalZones>>[1] =
      []
    A11_MudPatch_impl.effect.onComputeAnimalZones?.(player, zones, state)

    // The single empty field stays empty (no stack injected).
    expect(player.fields[0]!.stacks).toEqual([])

    // C8 sees no eligible field — onBuy returns null.
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
  })
})

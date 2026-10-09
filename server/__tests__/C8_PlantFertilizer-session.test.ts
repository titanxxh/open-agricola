import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C008_PlantFertilizer'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E080_RockGarden'
import '../../shared/cards/A/A011_MudPatch'
import { A011_MudPatch_impl } from '../../shared/cards/A/A011_MudPatch'

const CARD_ID = 'C008_PlantFertilizer'

const buyMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  let cardPrompt = response
  const directOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (!directOption) {
    const improvementOption = cardPrompt.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'),
    )
    expect(improvementOption).toBeDefined()
    cardPrompt = session.resolveChoice(0, improvementOption!.value)
    expect(cardPrompt.ok).toBe(true)
    if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  }
  if (
    cardPrompt.interaction.sourceCard === CARD_ID ||
    cardPrompt.state.players[1]!.minorHand.includes(CARD_ID)
  ) return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const setupPublicSession = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0]!.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}

const setupSession = () => {
  const session = new GameSession(42)
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
  it('public buy accepts once and grows every eligible ordinary and card field without spending goods', () => {
    const session = setupPublicSession()
    const state = session.getState().state
    const buyer = state.players[0]!
    buyer.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    buyer.minorPlayed.push('D075_WoodField')
    buyer.cardStates.D075_WoodField = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
    }
    buyer.resources.grain = 0
    buyer.resources.wood = 0
    session.loadState(state)
    const scoreBefore = session.getState().scores[0]!.total

    let response = buyMinor(session, session.takeAction(0, 'meeting-place'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected optional fertilizer choice')
    expect(response.interaction.promptKey).toBe('ui.interactionOptionalAction')
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    response = session.resolveChoice(0, accept!.value)

    const result = response.state.players[0]!
    expect(result.fields[0]!.stacks[0]).toMatchObject({ kind: 'grain', remaining: 2 })
    expect(result.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 2 },
    ])
    expect(result.resources).toMatchObject({ grain: 0, wood: 0 })
    expect(result.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.farmCropAdded',
      params: expect.objectContaining({ crops: { grain: 1, wood: 1 } }),
    }))
    expect(response.scores[0]!.total).toBe(scoreBefore)
  })

  it('public buy can decline without changing any eligible field and still passes', () => {
    const session = setupPublicSession()
    const state = session.getState().state
    const buyer = state.players[0]!
    buyer.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    session.loadState(state)
    const scoreBefore = session.getState().scores[0]!.total

    let response = buyMinor(session, session.takeAction(0, 'meeting-place'))
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, '__skip__')

    expect(response.state.players[0]!.fields[0]!.stacks[0]).toMatchObject({
      kind: 'vegetable',
      remaining: 1,
    })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropAdded')).toBe(false)
    expect(response.scores[0]!.total).toBe(scoreBefore)
  })

  it('public buy skips empty, total-2, and Mud Patch animal zones', () => {
    const session = setupPublicSession()
    const state = session.getState().state
    const buyer = state.players[0]!
    buyer.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    buyer.minorPlayed.push('A011_MudPatch')
    session.loadState(state)
    const scoreBefore = session.getState().scores[0]!.total

    const response = buyMinor(session, session.takeAction(0, 'meeting-place'))

    expect(response.state.players[0]!.fields).toEqual([
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.kind
      : response.interaction.stateId).toBe('confirm-next-player')
    expect(response.state.log.some((entry) => entry.key === 'log.farmCropAdded')).toBe(false)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.scores[0]!.total).toBe(scoreBefore)
  })

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
    player.minorPlayed.push('D075_WoodField')
    player.cardStates['D075_WoodField'] = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
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
    const woodStacks = player.cardStates['D075_WoodField']!.extraData!['cardFieldStacks'] as Array<{ crop: string; remaining: number }>
    expect(woodStacks[0]!.remaining).toBe(2)
    expect(player.resources.grain ?? 0).toBe(0)
    expect(player.resources.wood ?? 0).toBe(0)
  })

  it('decline path multi-location: nothing changes', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.minorPlayed.push('D075_WoodField')
    player.cardStates['D075_WoodField'] = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
    }
    session.loadState(state)

    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    expect(player.fields[0]!.stacks[0]!.remaining).toBe(1)
    const woodStacks = player.cardStates['D075_WoodField']!.extraData!['cardFieldStacks'] as Array<{ crop: string; remaining: number }>
    expect(woodStacks[0]!.remaining).toBe(1)
    expect(player.minorPlayed.includes(CARD_ID)).toBe(true)
  })

  it('A11 Mud Patch boar zone does NOT inject PIG into field.stacks (G6 invariant)', () => {
    const { session, state, player } = setupSession()
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.minorPlayed.push('A011_MudPatch')
    session.loadState(state)

    // Drive A11's onComputeAnimalZones — it should push a card-zone, NOT
    // mutate field.stacks. A011_MudPatch_impl is statically imported at
    // the top of the file (same convention used in other session tests
    // that need impl-level access, e.g. C006_StoneClearing-session test).
    const zones: Parameters<NonNullable<typeof A011_MudPatch_impl.effect.onComputeAnimalZones>>[1] =
      []
    A011_MudPatch_impl.effect.onComputeAnimalZones?.(player, zones, state)

    // The single empty field stays empty (no stack injected).
    expect(player.fields[0]!.stacks).toEqual([])

    // C8 sees no eligible field — onBuy returns null.
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).toBeNull()
  })
})

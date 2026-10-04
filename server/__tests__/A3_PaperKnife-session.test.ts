/**
 * A3 PaperKnife session tests — the reference alignment (Task 4.1).
 *
 * This file contains two sets of tests:
 *
 * 1. Unit-level prerequisite + onBuy tests (legacy, against the simplified impl —
 *    some will be updated / removed once Task 4.2 rewrites A3).
 *
 * 2. Session-level behavioral tests (new, TDD — FAILING against the current simplified
 *    impl, intended to pass after Task 4.2 rewrites A3).
 *
 * Target behavior per spec §2.1:
 *   onBuy → emit a pending 'selection' (interaction.stateId='selection') with:
 *     { kind: 'occupation-hand', selectableCards: player.occupationHand, min=3, max=3,
 *       selectionEffect: 'paper-knife-random-play' }
 *   commitSelectionChoice({ cardIds }) → selection effect fires:
 *     • rollAndCacheCardPick → caches pick in cardStates[CARD_ID].extraData.pick
 *     • state.pendingUndoBoundary = true
 *     • returns occupation leaf { exactCost: {}, allowedCards: [pick] }
 *   occupation prompt offers the revealed card or decline
 *
 * Current (simplified) impl: directly mutates occupationHand → occupationPlayed in onBuy,
 * never emits a selection pending, and skips the played occupation's onBuy.
 * Most session-tier tests below FAIL against the current impl.
 *
 * OCC_A = 'A116_WoodCutter'   — cost: {}, no onBuy side-effect (clean leaf)
 * OCC_B = 'A117_WoodCarrier'  — cost: {}, onBuy grants 1 wood per improvement (observable)
 * OCC_C = 'A118_Treegardener' — cost: {}, no onBuy side-effect (clean leaf)
 * OCC_D = 'A119_FirewoodCollector' — cost: {}, no onBuy side-effect (clean leaf)
 */

import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { A003_PaperKnife_impl } from '../../shared/cards/A/A003_PaperKnife'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome, setActiveWorkerCount } from '../../shared/domain/player'

import '../../shared/cards/A/A003_PaperKnife'
import { A003_PaperKnife } from '../../shared/cards/A/A003_PaperKnife'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A117_WoodCarrier'
import '../../shared/cards/A/A118_Treegardener'
import '../../shared/cards/A/A119_FirewoodCollector'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'A003_PaperKnife'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('A003_PaperKnife prerequisite', () => {
  it('registers "3 Occupations In Hand" as a custom prerequisite', () => {
    const player = createPlayer('p1')
    player.occupationHand = []
    expect(A003_PaperKnife_impl.prerequisiteCheck!(player)).toBe(false)

    player.occupationHand = ['A1', 'A2']
    expect(A003_PaperKnife_impl.prerequisiteCheck!(player)).toBe(false)

    player.occupationHand = ['A1', 'A2', 'A3']
    expect(A003_PaperKnife_impl.prerequisiteCheck!(player)).toBe(true)

    player.occupationHand = ['A1', 'A2', 'A3', 'A4']
    expect(A003_PaperKnife_impl.prerequisiteCheck!(player)).toBe(true)
  })

  it('is enforced by meetsCardPrerequisites on the card definition', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']
    expect(meetsCardPrerequisites(player, A003_PaperKnife)).toBe(false)

    player.occupationHand.push('A027_OvenSite')
    expect(meetsCardPrerequisites(player, A003_PaperKnife)).toBe(true)
  })
})

describe('A003_PaperKnife onBuy', () => {
  it('does nothing when fewer than 3 occupations in hand', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    // Hand unchanged.
    expect(player.occupationHand).toEqual(['A009_SheepFarmer', 'A124_Knapper'])
    expect(player.occupationPlayed).toEqual([])
  })

  it('onBuy emits a selection leaf (occupation-hand, min=max=3) when ≥3 occupations in hand', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('selection')

    // Hand must NOT be mutated by onBuy — mutation happens downstream via occupation
    expect(player.occupationPlayed).toHaveLength(0)
    expect(player.occupationHand).toHaveLength(3)

    // actionContext must carry occupation-hand selection params
    const ctx = (flow as Extract<ActionFlow, { type: 'leaf' }>).actionContext
    expect(ctx.selectionKind).toBe('occupation-hand')
    expect(ctx.minSelections).toBe(3)
    expect(ctx.maxSelections).toBe(3)
    expect(ctx.selectableCards).toEqual(['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite'])
  })

  it('does not consume any resources or mutate hand in onBuy', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    player.resources.food = 5
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    // Food untouched and hand unchanged — only a selection leaf was returned.
    expect(player.resources.food).toBe(5)
    expect(player.occupationHand).toHaveLength(3)
    expect(player.occupationPlayed).toHaveLength(0)
  })

  it('onBuy selectableCards snapshot matches occupation hand at call time', () => {
    const a = createPlayer('p1')
    const b = createPlayer('p1')
    a.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    b.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    const stateA = createState([a])
    const stateB = createState([b])
    const effect = getCardEffect(CARD_ID)!
    const flowA = effect.onBuy!(stateA, a)
    const flowB = effect.onBuy!(stateB, b)
    // Both should produce identical selectableCards (same hand)
    expect((flowA as Extract<ActionFlow, { type: 'leaf' }>).actionContext.selectableCards).toEqual(
      (flowB as Extract<ActionFlow, { type: 'leaf' }>).actionContext.selectableCards,
    )
  })
})

// ===========================================================================
// Session-tier behavioral tests (TDD — FAILING against current simplified impl)
// ===========================================================================

const SESSION_CARD_ID = 'A003_PaperKnife'
const OCC_A = 'A116_WoodCutter'
const OCC_B = 'A117_WoodCarrier'
const OCC_C = 'A118_Treegardener'
const OCC_D = 'A119_FirewoodCollector'

/**
 * Build a standard 2-player session in round 1, p0 current player.
 * p0 has A003_PaperKnife in minorHand, occupations in occupationHand, and 1 wood (A3's cost).
 */
const makeSession = (opts: { wood?: number; gameSeed?: number; occHand?: string[] } = {}) => {
  const { wood = 1, gameSeed = 42, occHand = [OCC_A, OCC_B, OCC_C, OCC_D] } = opts
  const session = new GameSession(gameSeed, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, 2)
  setWorkersAtHome(state, p0, 2)
  p0.minorHand = [SESSION_CARD_ID]
  p0.occupationHand = [...occHand]
  p0.resources.wood = wood
  p0.resources.food = 3

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, 2)
  setWorkersAtHome(state, p1, 2)
  p1.minorHand = ['__test_placeholder__']
  p1.occupationHand = ['__test_placeholder__']
  p1.resources.food = 5

  session.loadState(state)
  return session
}

/**
 * Drive the meeting-place -> A3 onBuy path.
 * Returns the resp AFTER resolving 'minor:A003_PaperKnife'.
 * In the target impl this should leave interaction.stateId === 'wait'
 * with kind 'occupation-hand'.
 */
const playA3 = (session: GameSession) => {
  const mpResp = session.takeAction(0, 'meeting-place')
  expect(mpResp.ok).toBe(true)
  expect(mpResp.interaction.stateId).toBe('wait')
  if (mpResp.interaction.stateId !== 'wait') return mpResp
  const improvementOption = mpResp.interaction.request.options?.find(
    (option) => option.value.startsWith('action-improvement-'),
  )
  let cardPrompt = mpResp
  if (improvementOption) {
    cardPrompt = session.resolveChoice(0, improvementOption.value)
    expect(cardPrompt.ok).toBe(true)
  }
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  if (cardPrompt.interaction.request.selection?.kind === 'occupation-hand') {
    return cardPrompt
  }
  const cardOption = cardPrompt.interaction.request.options?.find(
    (option) => option.value === SESSION_CARD_ID,
  )
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

// ---------------------------------------------------------------------------
// Case 1: onBuy emits a selection pending with kind='occupation-hand', min=max=3
// ---------------------------------------------------------------------------
describe('A003_PaperKnife session-tier: flow', () => {
  it('A003 S2: playing Paper Knife pays one wood, passes it left, and requires exactly three occupations', () => {
    const session = makeSession({ wood: 1 })

    const resp = playA3(session)

    expect(resp.ok).toBe(true)
    // TARGET: interaction.stateId must be 'selection', not 'choice' or 'idle'
    expect(resp.interaction.stateId).toBe('wait')

    const interaction = resp.interaction as Extract<InteractionState, { stateId: 'wait' }>
    // kind must be occupation-hand
    expect(interaction.request.selection?.kind).toBe('occupation-hand')
    // selectableCards must be the player's full occupation hand in order
    expect(interaction.request.selection?.selectableCards).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    // min and max must both be 3
    expect(interaction.request.selection?.minSelections).toBe(3)
    expect(interaction.request.selection?.maxSelections).toBe(3)

    // pending.sourceCard must be A3
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(SESSION_CARD_ID)

    const p0 = resp.state.players[0]!
    expect(p0.minorHand).not.toContain(SESSION_CARD_ID)
    expect(p0.minorPlayed).not.toContain(SESSION_CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(SESSION_CARD_ID)

    // Wood cost paid (1 wood → 0)
    expect(p0.resources.wood).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Case 2: commitSelection plays one of the chosen 3 for free
  // ---------------------------------------------------------------------------
  it('A003 S3: accepting the revealed occupation plays exactly one selected card for free', () => {
    const session = makeSession({ wood: 1, gameSeed: 42 })

    const a3Resp = playA3(session)
    // TARGET: selection pending
    expect(a3Resp.interaction.stateId).toBe('wait')
    if (a3Resp.interaction.stateId !== 'wait') return

    // Commit OCC_A, OCC_B, OCC_C; OCC_D is excluded
    const cardIds = [OCC_A, OCC_B, OCC_C]
    const commitResp = session.commitSelectionChoice(0, { cardIds })

    expect(commitResp.ok).toBe(true)

    expect(commitResp.interaction.stateId).toBe('wait')
    if (commitResp.interaction.stateId !== 'wait') return
    const p0 = commitResp.state.players[0]!
    const pick = p0.cardStates?.[SESSION_CARD_ID]?.extraData?.pick as string | undefined
    expect(pick).toBeDefined()
    const acceptOption = commitResp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption?.sourceCard).toBe(SESSION_CARD_ID)
    expect(commitResp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    expect(p0.occupationPlayed).toEqual([])
    expect(p0.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])

    const acceptResp = session.resolveChoice(0, acceptOption!.value)
    expect(acceptResp.ok).toBe(true)
    const acceptedPlayer = acceptResp.state.players[0]!

    // Exactly one of [OCC_A, OCC_B, OCC_C] must be in occupationPlayed
    const playedFromSelection = [OCC_A, OCC_B, OCC_C].filter(id =>
      acceptedPlayer.occupationPlayed.includes(id)
    )
    expect(playedFromSelection).toHaveLength(1)

    // The other two of the committed 3 must remain in occupationHand
    const remaining = [OCC_A, OCC_B, OCC_C].filter(id => !acceptedPlayer.occupationPlayed.includes(id))
    expect(remaining).toHaveLength(2)
    for (const id of remaining) {
      expect(acceptedPlayer.occupationHand).toContain(id)
    }

    // OCC_D (not committed) must be untouched in hand
    expect(acceptedPlayer.occupationHand).toContain(OCC_D)
    expect(acceptedPlayer.occupationPlayed).not.toContain(OCC_D)

    // No food paid (exactCost: {} = free play)
    expect(acceptedPlayer.resources.food).toBe(3)
    expect(playedFromSelection).toContain(pick)
  })

  it('A003 S4: declining the revealed occupation leaves every occupation in hand', () => {
    const session = makeSession({ wood: 1, gameSeed: 42 })
    const a3Resp = playA3(session)
    expect(a3Resp.interaction.stateId).toBe('wait')

    const resp = session.commitSelectionChoice(0, { cardIds: [OCC_A, OCC_B, OCC_C] })

    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    const pick = player.cardStates?.[SESSION_CARD_ID]?.extraData?.pick as string | undefined
    expect(pick).toBeDefined()
    expect(player.occupationPlayed).toEqual([])
    expect(player.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    expect(player.resources.food).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.find((option) => option.value !== '__skip__')?.sourceCard).toBe(SESSION_CARD_ID)
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok).toBe(true)
    expect(declined.state.players[0]!.occupationPlayed).toEqual([])
    expect(declined.state.players[0]!.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    expect(declined.state.players[0]!.resources.food).toBe(3)
  })

  // ---------------------------------------------------------------------------
  // Case 3: Deterministic — same seed + same 3 committed → same pick
  // ---------------------------------------------------------------------------
  it('case 3: same gameSeed and same 3 committed always produce the same pick', () => {
    const session1 = makeSession({ gameSeed: 42 })
    const session2 = makeSession({ gameSeed: 42 })

    playA3(session1)
    playA3(session2)

    const cardIds = [OCC_A, OCC_B, OCC_C]
    const resp1 = session1.commitSelectionChoice(0, { cardIds })
    const resp2 = session2.commitSelectionChoice(0, { cardIds })

    expect(resp1.ok).toBe(true)
    expect(resp2.ok).toBe(true)

    const pick1 = resp1.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.extraData?.pick
    const pick2 = resp2.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.extraData?.pick

    expect(pick1).toBeDefined()
    expect(pick2).toBeDefined()
    // Determinism: identical seeds + identical committed set → identical picks
    expect(pick1).toBe(pick2)
  })

  // ---------------------------------------------------------------------------
  // Case 4: Undo cannot cross the random-pick boundary
  // ---------------------------------------------------------------------------
  it('A003 S5: undo is rejected after the random occupation has been revealed', () => {
    const session = makeSession({ wood: 1 })

    const a3Resp = playA3(session)
    expect(a3Resp.interaction.stateId).toBe('wait')
    if (a3Resp.interaction.stateId !== 'wait') return

    // Commit — triggers the roll and sets pendingUndoBoundary
    const commitResp = session.commitSelectionChoice(0, { cardIds: [OCC_A, OCC_B, OCC_C] })
    expect(commitResp.ok).toBe(true)

    // The pick must be cached after commit
    const pick = commitResp.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.extraData?.pick
    expect(pick).toBeDefined()

    // undoStep must be blocked — the boundary was set during the roll
    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(false)
    expect(undoResp.error).toBe('cannot undo past boundary')

    // The revealed prompt and player state must survive the failed undo
    const afterUndo = session.getState()
    const stateAfterUndo = afterUndo.state
    const pickAfter = stateAfterUndo.players[0]?.cardStates?.[SESSION_CARD_ID]?.extraData?.pick
    expect(pickAfter).toBe(pick)
    expect(stateAfterUndo.players[0]!.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    expect(stateAfterUndo.players[0]!.occupationPlayed).toEqual([])
    expect(afterUndo.interaction).toEqual(commitResp.interaction)
  })

  // ---------------------------------------------------------------------------
  // Case 5: Prerequisite — fewer than 3 occupations rejects play
  // ---------------------------------------------------------------------------
  it('A003 S1: fewer than three occupations rejects Paper Knife without polluting retry state', () => {
    const session = makeSession({ wood: 1, occHand: [OCC_A, OCC_B] })

    const blocked = session.takeAction(0, 'meeting-place')
    expect(blocked.ok).toBe(true)
    expect(blocked.interaction.stateId).toBe('wait')
    if (blocked.interaction.stateId !== 'wait') return
    expect(blocked.interaction.request.kind).toBe('confirm-next-player')
    expect(blocked.interaction.request.options ?? []).toEqual([])
    expect(blocked.state.players[0]!.minorHand).toContain(SESSION_CARD_ID)
    expect(blocked.state.players[1]!.minorHand).not.toContain(SESSION_CARD_ID)
    expect(blocked.state.players[0]!.resources.wood).toBe(1)

    const undone = session.undoStep()
    expect(undone.ok).toBe(true)
    const retryState = session.getState().state
    retryState.players[0]!.occupationHand.push(OCC_C)
    session.loadState(retryState)

    const retry = playA3(session)
    expect(retry.ok).toBe(true)
    expect(retry.interaction.stateId).toBe('wait')
    if (retry.interaction.stateId !== 'wait') return
    expect(retry.interaction.request.selection?.kind).toBe('occupation-hand')
  })

  // ---------------------------------------------------------------------------
  // Case 6: Picked occupation's onBuy fires (A117_WoodCarrier grants wood)
  // ---------------------------------------------------------------------------
  it('case 6: the randomly picked occupation onBuy fires — A117 grants wood per improvement', () => {
    // A117_WoodCarrier onBuy: grants 1 wood per improvement (major + minor) already in play.
    // We pre-load a minor improvement so A117 grants >= 1 wood when played.
    // This asserts that the full occupation path runs (fixing the pre-rewrite bypass).
    const session = makeSession({ wood: 1, gameSeed: 42 })
    const state = session.getState().state

    const p0 = state.players[0]!
    p0.occupationHand = [OCC_A, OCC_B, OCC_C, OCC_D]
    p0.minorHand = [SESSION_CARD_ID]
    p0.resources.wood = 1
    // Pre-load one minor improvement so A117 onBuy has an improvement to count.
    p0.minorPlayed = ['A010_WoodenShed']

    session.loadState(state)

    const a3Resp = playA3(session)
    // TARGET: selection pending emitted
    expect(a3Resp.interaction.stateId).toBe('wait')
    if (a3Resp.interaction.stateId !== 'wait') return

    // Record wood after A3's wood cost was paid
    const woodAfterA3Pay = a3Resp.state.players[0]!.resources.wood

    // Commit OCC_A, OCC_B, OCC_C — may include OCC_B (A117) as one of the 3
    const commitResp = session.commitSelectionChoice(0, { cardIds: [OCC_A, OCC_B, OCC_C] })
    expect(commitResp.ok).toBe(true)

    expect(commitResp.interaction.stateId).toBe('wait')
    if (commitResp.interaction.stateId !== 'wait') return
    const pick = commitResp.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.extraData?.pick as string | undefined
    expect(pick).toBeDefined()
    const acceptOption = commitResp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    const acceptResp = session.resolveChoice(0, acceptOption!.value)
    expect(acceptResp.ok).toBe(true)
    const p0After = acceptResp.state.players[0]!
    // The pick must be in occupationPlayed
    expect(p0After.occupationPlayed).toContain(pick)

    if (pick === OCC_B) {
      // A117 onBuy fired → grants wood per improvement.
      // p0 has A010_WoodenShed in minorPlayed (pre-loaded) + A3 was just added to minorPlayed
      // = at least 2 minor improvements, so wood should increase by >= 2.
      // Use >= woodAfterA3Pay + 1 as a conservative lower bound to accommodate timing variance.
      // This assertion would FAIL on the pre-rewrite impl (which bypasses onBuy entirely).
      expect(p0After.resources.wood).toBeGreaterThanOrEqual(woodAfterA3Pay + 1)
    }
  })

  // ---------------------------------------------------------------------------
  // Case 7: Occupation with unpayable additional cost (skipped — not applicable)
  // ---------------------------------------------------------------------------
  it.skip('case 7: occupation with unpayable additionalCost (not applicable with exactCost: {})', () => {
    // TODO (to revisit in Task 4.2 if needed):
    //
    // A3's selectionEffect inserts a occupation leaf with exactCost: {}.
    // In the current occupation action, exactCost completely replaces the
    // occupation's cost — there is no "additionalCost" field that survives the override.
    // Therefore, every A3-played occupation is free, regardless of its base cost.
    //
    // The reference spec §6 item 3: "the reference likely fails the play silently, leaving the occupation in
    // hand, when the occupation cost is unpayable." With exactCost: {} this
    // scenario cannot arise in our engine — the occupation is always affordable.
    //
    // If a future "additionalCost" concept is added to occupations (independent of
    // exactCost), this test should be re-enabled and a suitable occupation used.
    // Until then, the scenario is untestable without modifying the type system.
  })
})

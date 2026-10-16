import { createInitialState } from '../../shared/session/state-bootstrap'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { A003_PaperKnife_impl, A003_PaperKnife } from '../../shared/cards/A/A003_PaperKnife'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A117_WoodCarrier'
import '../../shared/cards/A/A118_Treegardener'
import '../../shared/cards/A/A119_FirewoodCollector'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A003_PaperKnife'

const createPlayer = (id = 'p1'): PlayerState => {
  const player = createInitialState(1, { playerCount: 2 }).players[0]!
  player.id = id
  player.name = id
  player.minorHand = []
  player.occupationHand = []
  Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
  return player
}

const createState = (players: PlayerState[]): GameState => ({
  ...createInitialState(1, { playerCount: 2 }), players,
})

describe('A003_PaperKnife prerequisite', () => {
  it('registers "3 Occupations In Hand" as a custom prerequisite', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer('p1')
    player.occupationHand = []
    expect(withActiveRegistry(ruleRegistry, () => A003_PaperKnife_impl.prerequisiteCheck!(player))).toBe(false)

    player.occupationHand = ['A1', 'A2']
    expect(withActiveRegistry(ruleRegistry, () => A003_PaperKnife_impl.prerequisiteCheck!(player))).toBe(false)

    player.occupationHand = ['A1', 'A2', 'A3']
    expect(withActiveRegistry(ruleRegistry, () => A003_PaperKnife_impl.prerequisiteCheck!(player))).toBe(true)

    player.occupationHand = ['A1', 'A2', 'A3', 'A4']
    expect(withActiveRegistry(ruleRegistry, () => A003_PaperKnife_impl.prerequisiteCheck!(player))).toBe(true)
  })

  it('is enforced by meetsCardPrerequisites on the card definition', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']
    expect(withActiveRegistry(ruleRegistry, () => meetsCardPrerequisites(player, A003_PaperKnife))).toBe(false)

    player.occupationHand.push('A027_OvenSite')
    expect(withActiveRegistry(ruleRegistry, () => meetsCardPrerequisites(player, A003_PaperKnife))).toBe(true)
  })
})

describe('A003_PaperKnife onBuy', () => {
  it('does nothing when fewer than 3 occupations in hand', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper']
    const state = createState([player])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
    // Hand unchanged.
    expect(player.occupationHand).toEqual(['A009_SheepFarmer', 'A124_Knapper'])
    expect(player.occupationPlayed).toEqual([])
  })

  it('onBuy emits a selection leaf (occupation-hand, min=max=3) when ≥3 occupations in hand', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    const state = createState([player])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    const flow = withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    assert.ok(flow?.type === 'leaf')
    expect(flow.actionId).toBe('selection')

    // Hand must NOT be mutated by onBuy — mutation happens downstream via occupation
    expect(player.occupationPlayed).toHaveLength(0)
    expect(player.occupationHand).toHaveLength(3)

    // actionContext must carry occupation-hand selection params
    const ctx = flow.actionContext
    assert.ok(ctx)
    expect(ctx.selectionKind).toBe('occupation-hand')
    expect(ctx.minSelections).toBe(3)
    expect(ctx.maxSelections).toBe(3)
    expect(ctx.selectableCards).toEqual(['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite'])
  })

  it('does not consume any resources or mutate hand in onBuy', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer('p1')
    player.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    player.resources.food = 5
    const state = createState([player])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    // Food untouched and hand unchanged — only a selection leaf was returned.
    expect(player.resources.food).toBe(5)
    expect(player.occupationHand).toHaveLength(3)
    expect(player.occupationPlayed).toHaveLength(0)
  })

  it('onBuy selectableCards snapshot matches occupation hand at call time', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const a = createPlayer('p1')
    const b = createPlayer('p1')
    a.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    b.occupationHand = ['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite']
    const stateA = createState([a])
    const stateB = createState([b])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))!
    const flowA = withActiveRegistry(ruleRegistry, () => effect.onBuy!(stateA, a))
    const flowB = withActiveRegistry(ruleRegistry, () => effect.onBuy!(stateB, b))
    // Both should produce identical selectableCards (same hand)
    assert.ok(flowA?.type === 'leaf' && flowB?.type === 'leaf')
    expect(flowA.actionContext?.selectableCards).toEqual(['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite'])
    expect(flowB.actionContext?.selectableCards).toEqual(['A009_SheepFarmer', 'A124_Knapper', 'A027_OvenSite'])
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
  const session = evidence.track(createWorkSession({ seed: gameSeed, options: { playerCount: 2 } }))
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
  const improvementOption = getChoiceOptions(mpResp)?.find(
    (option) => option.value.startsWith('action-improvement-'),
  )
  let cardPrompt = mpResp
  if (improvementOption) {
    cardPrompt = session.resolveChoice(0, improvementOption.value)
    expect(cardPrompt.ok).toBe(true)
  }
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  if (cardPrompt.interaction.request.kind === 'selection' && cardPrompt.interaction.request.selection.kind === 'occupation-hand') {
    return cardPrompt
  }
  const cardOption = getChoiceOptions(cardPrompt)?.find(
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

    const interaction = resp.interaction
    assert.ok(interaction.stateId === 'wait' && interaction.request.kind === 'selection'
      && interaction.request.selection.kind === 'occupation-hand')
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
    const pick = p0.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
    expect(pick).toBeDefined()
    const acceptOption = getChoiceOptions(commitResp)?.find((option) => option.value !== '__skip__')
    expect(acceptOption?.sourceCard).toBe(SESSION_CARD_ID)
    expect(getChoiceOptions(commitResp)?.some((option) => option.value === '__skip__')).toBe(true)
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

  it.each([
    { scenario: 'duplicate cards', cardIds: [OCC_A, OCC_A, OCC_A] },
    { scenario: 'too few cards', cardIds: [OCC_A, OCC_B] },
    { scenario: 'a card outside the hand', cardIds: [OCC_A, OCC_B, '__not_in_hand__'] },
  ])('rejects $scenario atomically before randomness, then accepts a legal subset', ({ cardIds }) => {
    const session = makeSession({ wood: 1, gameSeed: 42 })
    const initial = playA3(session)
    const before = JSON.stringify(session.state)
    const beforeLogLength = session.state.log.length
    const pending = structuredClone(initial.interaction)
    const rejected = session.commitSelectionChoice(0, { cardIds })
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
    expect(rejected.interaction).toEqual(pending)
    expect(session.state.players[0]!.cardStates[SESSION_CARD_ID]?.privateData?.pick).toBeUndefined()

    const control = makeSession({ wood: 1, gameSeed: 42 })
    playA3(control)
    const valid = [OCC_A, OCC_B, OCC_C]
    const expected = control.commitSelectionChoice(0, { cardIds: valid })
    const response = session.commitSelectionChoice(0, { cardIds: valid })
    expect(response.ok, response.error).toBe(true)
    const pick = response.state.players[0]!.cardStates[SESSION_CARD_ID]?.privateData?.pick
    expect(pick).toBe(expected.state.players[0]!.cardStates[SESSION_CARD_ID]?.privateData?.pick)
    expect(valid).toContain(pick)
    expect(response.interaction.stateId).toBe('wait')
    const accept = getChoiceOptions(response).find(option => option.value !== '__skip__')!
    const played = session.resolveChoice(0, accept.value)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toEqual([pick])
    expect(played.state.players[0]!.resources.food).toBe(3)
    expect(played.state.log.length).toBeGreaterThan(beforeLogLength)
  })

  it('A003 S4: declining the revealed occupation leaves every occupation in hand', () => {
    const session = makeSession({ wood: 1, gameSeed: 42 })
    const a3Resp = playA3(session)
    expect(a3Resp.interaction.stateId).toBe('wait')

    const resp = session.commitSelectionChoice(0, { cardIds: [OCC_A, OCC_B, OCC_C] })

    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    const pick = player.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
    expect(pick).toBeDefined()
    expect(player.occupationPlayed).toEqual([])
    expect(player.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    expect(player.resources.food).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')?.sourceCard).toBe(SESSION_CARD_ID)
    expect(getChoiceOptions(resp)?.some((option) => option.value === '__skip__')).toBe(true)

    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok).toBe(true)
    expect(declined.state.players[0]!.occupationPlayed).toEqual([])
    expect(declined.state.players[0]!.occupationHand).toEqual([OCC_A, OCC_B, OCC_C, OCC_D])
    expect(declined.state.players[0]!.resources.food).toBe(3)
    for (const response of [resp, declined]) {
      expect(JSON.stringify(session.buildSyncPayload(response, player.id))).toContain(pick)
      for (const viewer of [response.state.players[1]!.id, null]) {
        const payload = JSON.stringify(session.buildSyncPayload(response, viewer))
        for (const cardId of [OCC_A, OCC_B, OCC_C, OCC_D]) expect(payload).not.toContain(cardId)
      }
    }
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

    const pick1 = resp1.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
    const pick2 = resp2.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.privateData?.pick

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
    const pick = commitResp.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
    expect(pick).toBeDefined()

    // undoStep must be blocked — the boundary was set during the roll
    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(false)
    expect(undoResp.error).toBe('cannot undo past boundary')

    // The revealed prompt and player state must survive the failed undo
    const afterUndo = session.getState()
    const stateAfterUndo = afterUndo.state
    const pickAfter = stateAfterUndo.players[0]?.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
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
    expect(getChoiceOptions(blocked) ?? []).toEqual([])
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
    assert.ok(retry.interaction.request.kind === 'selection')
    expect(retry.interaction.request.selection.kind).toBe('occupation-hand')
  })

  // ---------------------------------------------------------------------------
  // Case 6: Picked occupation's onBuy fires (A117_WoodCarrier grants wood)
  // ---------------------------------------------------------------------------
  it('case 6: the randomly picked occupation onBuy fires — A117 grants wood per improvement', () => {
    const session = makeSession({ wood: 1, gameSeed: 7 })
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

    expect(a3Resp.state.players[0]!.resources.wood).toBe(0)

    const commitResp = session.commitSelectionChoice(0, { cardIds: [OCC_A, OCC_B, OCC_C] })
    expect(commitResp.ok).toBe(true)

    expect(commitResp.interaction.stateId).toBe('wait')
    if (commitResp.interaction.stateId !== 'wait') return
    const pick = commitResp.state.players[0]!.cardStates?.[SESSION_CARD_ID]?.privateData?.pick
    expect(pick).toBe(OCC_B)
    const acceptOption = getChoiceOptions(commitResp)?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    const acceptResp = session.resolveChoice(0, acceptOption!.value)
    expect(acceptResp.ok).toBe(true)
    const p0After = acceptResp.state.players[0]!
    expect(p0After.occupationPlayed).toContain(OCC_B)
    expect(p0After.minorPlayed).toEqual(['A010_WoodenShed'])
    expect(p0After.resources.wood).toBe(1)
  })


})

describe('A003 rule boundaries', () => {

  const occupations = ['A116_WoodCutter', 'A118_Treegardener', 'A119_FirewoodCollector', 'A103_Portmonger']

  function setup(card: string, configure: (state: GameState) => void = () => { }) {
    return evidence.track(createWorkSession({
      configure(state) {
        state.players[0]!.minorHand = [card]
        state.players[0]!.occupationHand = [...occupations]
        for (const player of state.players) {
          player.resources.wood = 0
          player.resources.food = 0
        }
        configure?.(state)
      }
    }))
  }

  function requireWait(response: SessionResponse) {
    assert.equal(response.ok, true, response.error)
    assert(response.interaction.stateId === 'wait')
    return response.interaction
  }

  function play(session: ReturnType<typeof setup>, card: string) {
    let response = session.takeAction(0, 'meeting-place')
    requireWait(response)
    if (!response.state.players[0]!.minorHand.includes(card))
      return response
    if (!choices(response).some(option => option.value === card)) {
      const improvement = choices(response).find(option => option.value.startsWith('action-improvement-'))
      assert(improvement)
      response = session.resolveChoice(0, improvement.value)
      if (!response.state.players[0]!.minorHand.includes(card))
        return response
      requireWait(response)
    }
    assert(choices(response).some(option => option.value === card))
    return session.resolveChoice(0, card)
  }

  function choices(response: SessionResponse) {
    const request = requireWait(response).request
    assert(request.kind === 'choice')
    return request.options
  }

  function accept(session: ReturnType<typeof setup>, response: SessionResponse) {
    const candidates = choices(response).filter(candidate => !['skip', '__skip__'].includes(candidate.value))
    assert.equal(candidates.length, 1, JSON.stringify(response.interaction))
    return session.resolveChoice(0, candidates[0]!.value)
  }

  it("Paper Knife must reject four occupations and legally play one selected card without food", () => {
    const session = setup('A003_PaperKnife', state => { state.players[0]!.resources.wood = 1 })
    play(session, 'A003_PaperKnife')
    const selected = occupations.slice(0, 3)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { cardIds: occupations }))
    const selectedResponse = session.commitSelectionChoice(0, { cardIds: selected })
    const response = accept(session, selectedResponse)
    assert.equal(response.ok, true, response.error)
    const player = response.state.players[0]!
    assert.equal(player.occupationPlayed.length, 1)
    assert(selected.includes(player.occupationPlayed[0]!))
    assert(player.occupationHand.includes(occupations[3]!))
    assert.equal(player.occupationHand.length, 3)
    assert.equal(player.resources.food, 0)
    assert.equal(player.resources.wood, 0)
    assert(response.state.players[1]!.minorHand.includes('A003_PaperKnife'))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { cardIds: selected }))

    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player', JSON.stringify(response.interaction))
    assert.equal(response.interaction.playerIndex, 0)
    assert.equal(response.state.currentPlayerIndex, 0)
  })

  it("Paper Knife must reject selecting the same occupation three times", () => {
    const session = setup('A003_PaperKnife', state => { state.players[0]!.resources.wood = 1 })
    play(session, 'A003_PaperKnife')
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { cardIds: [occupations[0]!, occupations[0]!, occupations[0]!] }))
    const retry = session.commitSelectionChoice(0, { cardIds: occupations.slice(0, 3) })
    const continuation = requireWait(retry)
    assert.equal(continuation.request.kind, 'choice')
    assert.equal(continuation.playerIndex, 0)
    assert.equal(continuation.sourceCard, 'A003_PaperKnife')
    assert.equal(choices(retry).filter(option => !['skip', '__skip__'].includes(option.value)).length, 1)
  })

  it("Paper Knife must reject three occupations belonging to the other player", () => {
    const foreign = ['A117_WoodCarrier', 'B116_Shoreforester', 'C109_SchnappsDistiller']
    const session = setup('A003_PaperKnife', state => {
      state.players[0]!.resources.wood = 1
      state.players[1]!.occupationHand = [...foreign]
    })
    play(session, 'A003_PaperKnife')
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { cardIds: foreign }))
    const retry = session.commitSelectionChoice(0, { cardIds: occupations.slice(0, 3) })
    const continuation = requireWait(retry)
    assert.equal(continuation.request.kind, 'choice')
    assert.equal(continuation.playerIndex, 0)
    assert.equal(continuation.sourceCard, 'A003_PaperKnife')
    assert.equal(choices(retry).filter(option => !['skip', '__skip__'].includes(option.value)).length, 1)
  })
})

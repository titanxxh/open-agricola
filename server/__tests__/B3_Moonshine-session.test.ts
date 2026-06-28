/**
 * Failing TDD tests for B3 Moonshine BGA alignment (Task 3.1).
 *
 * Target behavior (from spec docs/superpowers/specs/2026-04-19-align-bga-A3-B3-design.md §2.2):
 *   onBuy → rollAndCacheCardPick → pendingUndoBoundary = true
 *         → emit pending 'choice' with {play, pass} options
 *   resolveChoice('play') → insert occupation leaf (exactCost: { food: 2 })
 *   resolveChoice('pass') → passOccupationToNextPlayer
 *
 * Current (simplified) behavior: auto-resolves XOR, mutates hand directly,
 * never emits a pending choice. So most tests below FAIL against the current impl.
 *
 * OCC_A = 'A116_WoodCutter'  — cost: {}, no onBuy side-effect (clean leaf)
 * OCC_B = 'A117_WoodCarrier' — cost: {}, onBuy grants wood per improvement (observable)
 *
 * A116 and A117 are both zero-cost occupations. A117 is used for case 8 because its
 * onBuy has an observable side effect (wood gain per improvement in play).
 */

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome, setActiveWorkerCount } from '../../shared/domain/player'

// Force card modules to register their effects.
import '../../shared/cards/B/B003_Moonshine'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A117_WoodCarrier'

const CARD_ID = 'B003_Moonshine'
const OCC_A = 'A116_WoodCutter'
const OCC_B = 'A117_WoodCarrier'

/** Build a standard 2-player session in round 1, p0 current player.
 *  p0 has B003_Moonshine in minorHand and [OCC_A, OCC_B] in occupationHand.
 *  food is configurable (default 3).
 */
const makeSession = (opts: { food?: number; gameSeed?: number } = {}) => {
  const { food = 3, gameSeed = 42 } = opts
  const session = new GameSession(gameSeed, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, 2)
  setWorkersAtHome(state, p0, 2)
  p0.minorHand = [CARD_ID]
  p0.occupationHand = [OCC_A, OCC_B]
  p0.resources.food = food

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, 2)
  setWorkersAtHome(state, p1, 2)
  p1.resources.food = 5

  session.loadState(state)
  return session
}

/** Drive the meeting-place -> B3 onBuy path.
 *  Returns the resp AFTER resolving 'minor:B003_Moonshine', which should be
 *  the pending choice {play, pass} in the target implementation.
 */
const playB3 = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  // meeting-place offers a choice of available minor improvements
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.sourceCard === CARD_ID) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.options?.find((option) => option.value === `minor:${CARD_ID}`)
  expect(cardOption).toBeDefined()
  // Choose to play B003_Moonshine
  return session.resolveChoice(0, cardOption!.value)
}

// ---------------------------------------------------------------------------
// Case 1: onBuy emits a pending choice with {play, pass} options
// ---------------------------------------------------------------------------
describe('B003_Moonshine session', () => {
  it('case 1: onBuy emits a choice pending with play and pass options', () => {
    const session = makeSession({ food: 3 })

    const resp = playB3(session)

    expect(resp.ok).toBe(true)
    // TARGET: B3 should emit a pending choice, not auto-resolve
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // The choice should be attributed to B3
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    // Options must include exactly 'play' and 'pass'
    const optionValues = resp.interaction.options?.map((o) => o.value).sort()
    expect(optionValues).toEqual(['pass', 'play'])

    // The random pick should be cached in cardStates
    const p0 = resp.state.players[0]!
    const cachedOcc = p0.cardStates?.[CARD_ID]?.extraData?.occ
    expect(cachedOcc === OCC_A || cachedOcc === OCC_B).toBe(true)

    expect(p0.minorHand).not.toContain(CARD_ID)
    expect(p0.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)

    // Food should NOT be deducted yet (deduction happens on resolveChoice('play'))
    expect(p0.resources.food).toBe(3)
  })

  // ---------------------------------------------------------------------------
  // Case 2: resolveChoice('play') routes through occupation, pays 2 food
  // ---------------------------------------------------------------------------
  it('case 2: resolveChoice(play) routes through occupation and deducts 2 food', () => {
    const session = makeSession({ food: 3 })

    const b3Resp = playB3(session)
    // TARGET: pending choice should be emitted first
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ as string | undefined
    expect(pickedOcc).toBeDefined()

    const playResp = session.resolveChoice(0, 'play')
    expect(playResp.ok).toBe(true)

    const p0After = playResp.state.players[0]!
    // The picked occupation must be in occupationPlayed
    expect(p0After.occupationPlayed).toContain(pickedOcc)
    // The picked occupation must NOT be in occupationHand anymore
    expect(p0After.occupationHand).not.toContain(pickedOcc)
    // Food must have decreased by 2 (was 3, now 1)
    expect(p0After.resources.food).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Case 3: resolveChoice('pass') moves the card to p1's hand in a 2-player game
  // ---------------------------------------------------------------------------
  it('case 3: resolveChoice(pass) moves the picked occupation to p2 hand', () => {
    const session = makeSession({ food: 3 })

    const b3Resp = playB3(session)
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ as string | undefined
    expect(pickedOcc).toBeDefined()

    const passResp = session.resolveChoice(0, 'pass')
    expect(passResp.ok).toBe(true)

    const p0After = passResp.state.players[0]!
    const p1After = passResp.state.players[1]!

    // Picked occupation must NOT be in p0's hand
    expect(p0After.occupationHand).not.toContain(pickedOcc)
    // Picked occupation MUST be in p1's hand
    expect(p1After.occupationHand).toContain(pickedOcc)
    // p0's food should be unchanged (no payment on pass)
    expect(p0After.resources.food).toBe(3)
  })

  // ---------------------------------------------------------------------------
  // Case 4: play option is disabled when food < 2; resolveChoice('play') rejected
  // ---------------------------------------------------------------------------
  it('case 4: play option disabled when food < 2; resolveChoice(play) returns ok:false', () => {
    const session = makeSession({ food: 1 })

    const b3Resp = playB3(session)
    // TARGET: still emits a choice, but 'play' is disabled
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    const playOption = b3Resp.interaction.options?.find((o) => o.value === 'play')
    expect(playOption).toBeDefined()
    expect(playOption?.disabled).toBe(true)

    // Server must reject resolveChoice('play') when option is disabled
    const badResp = session.resolveChoice(0, 'play')
    expect(badResp.ok).toBe(false)
    // Error should reference 'disabled' (exact wording may vary)
    expect(badResp.error ?? '').toMatch(/disabled/)

    // But 'pass' must still work
    const passResp = session.resolveChoice(0, 'pass')
    expect(passResp.ok).toBe(true)

    // After pass: the picked occ is removed from p0's hand and appears in p1's
    const p0After = passResp.state.players[0]!
    const p1After = passResp.state.players[1]!
    // One occ was removed from p0 (was 2, now 1)
    expect(p0After.occupationHand.length).toBe(1)
    // That occ is now in p1's hand
    expect(p1After.occupationHand.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Case 5: Solo (1 player) — pass discards rather than passing to another player
  // Skipped after main's 2026-04-19 player-count-aware action-space filtering:
  // meeting-place is configured with `players: [2,3,4]`, so a 1-player session
  // cannot reach B3 through the normal path. Solo discard semantics are covered
  // by the unit test in shared/cards/helpers/__tests__/pass-occupation.test.ts.
  // ---------------------------------------------------------------------------
  it.skip('case 5: solo game — pass discards the picked occupation', () => {
    const session = makeSession({ food: 3 })
    // Trim to 1 player directly in state
    const state = session.getState().state
    state.players = state.players.slice(0, 1)
    state.currentPlayerIndex = 0
    const p0 = state.players[0]!
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    p0.minorHand = [CARD_ID]
    p0.occupationHand = [OCC_A, OCC_B]
    p0.resources.food = 3
    session.loadState(state)

    const b3Resp = playB3(session)
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ as string | undefined
    expect(pickedOcc).toBeDefined()

    const passResp = session.resolveChoice(0, 'pass')
    expect(passResp.ok).toBe(true)

    const p0After = passResp.state.players[0]!
    // Picked occupation must be removed from hand (discarded — no next player)
    expect(p0After.occupationHand).not.toContain(pickedOcc)
    // No other player to receive it
    expect(passResp.state.players.length).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Case 6: Determinism — same gameSeed, same hand -> same random pick
  // ---------------------------------------------------------------------------
  it('case 6: same gameSeed and same hand always pick the same occupation', () => {
    const session1 = makeSession({ gameSeed: 42 })
    const session2 = makeSession({ gameSeed: 42 })

    const resp1 = playB3(session1)
    const resp2 = playB3(session2)

    // Both must produce a pending choice (target behavior)
    expect(resp1.interaction.stateId).toBe('wait')
    expect(resp2.interaction.stateId).toBe('wait')
    if (resp1.interaction.stateId !== 'wait' || resp2.interaction.stateId !== 'wait') return

    const pick1 = resp1.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ
    const pick2 = resp2.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ

    expect(pick1).toBeDefined()
    expect(pick2).toBeDefined()
    // Determinism: identical seeds -> identical picks
    expect(pick1).toBe(pick2)
  })

  // ---------------------------------------------------------------------------
  // Case 7: Undo cannot cross the random-pick boundary
  // ---------------------------------------------------------------------------
  it('case 7: undoStep is blocked after B3 random-pick (undo boundary)', () => {
    const session = makeSession({ food: 3 })

    const b3Resp = playB3(session)
    // TARGET: pending choice emitted after roll
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    // The cached pick must be set
    const pickBefore = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ
    expect(pickBefore).toBeDefined()

    // undoStep should be blocked because the boundary was set during the roll
    const undoResp = session.undoStep()
    // With the boundary flag, undoStep must return ok:false
    expect(undoResp.ok).toBe(false)
    expect(undoResp.error).toBe('cannot undo past boundary')

    // The cached pick must still be present (boundary held)
    const stateAfterUndo = session.getState().state
    const pickAfter = stateAfterUndo.players[0]?.cardStates?.[CARD_ID]?.extraData?.occ
    expect(pickAfter).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // Case 8: Played occupation's onBuy fires (play branch)
  // ---------------------------------------------------------------------------
  it('case 8: resolveChoice(play) fires the played occupation onBuy — A117 grants wood', () => {
    // Force the random pick to be OCC_B = A117_WoodCarrier by placing only it in hand.
    // A117 onBuy: grants 1 wood per improvement already in play (major + minor).
    // We give p0 one minor improvement in minorPlayed so A117 grants >= 1 wood.
    const session = makeSession({ food: 3, gameSeed: 42 })
    const state = session.getState().state

    const p0 = state.players[0]!
    // Only A117 in hand so the random pick is deterministically A117.
    p0.occupationHand = [OCC_B]
    p0.minorHand = [CARD_ID]
    p0.resources.food = 3
    p0.resources.wood = 0
    // Pre-load one minor improvement into minorPlayed so A117 has something to count.
    // Using 'A010_WoodShed' as a placeholder (any valid minor id — we only need the count).
    p0.minorPlayed = ['A010_WoodenShed']

    session.loadState(state)

    const b3Resp = playB3(session)
    // TARGET: must emit {play, pass} choice
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    // The pick must be OCC_B since it's the only occupation in hand
    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.occ
    expect(pickedOcc).toBe(OCC_B)

    const woodBefore = b3Resp.state.players[0]!.resources.wood

    // Resolve 'play' -> occupation path -> A117 onBuy fires
    const playResp = session.resolveChoice(0, 'play')
    expect(playResp.ok).toBe(true)

    const p0After = playResp.state.players[0]!
    // A117 grants 1 wood per improvement. p0 has 1 minor (A010_WoodenShed) + B3 itself
    // may or may not be counted depending on timing — so assert at least 1 wood gained.
    // TODO: Task 4 can revisit with a more isolated setup to pin the exact gain count.
    expect(p0After.resources.wood).toBeGreaterThanOrEqual(woodBefore + 1)
    // A117 must be in occupationPlayed
    expect(p0After.occupationPlayed).toContain(OCC_B)
  })
})

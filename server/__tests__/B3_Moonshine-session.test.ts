/**
 * Failing TDD tests for B3 Moonshine the reference alignment (Task 3.1).
 *
 * Target behavior:
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
import { authoritativeCommandKey } from '../../shared/contract/authoritative-command'
import { setWorkersAtHome, setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

// Force card modules to register their effects.
import '../../shared/cards/B/B003_Moonshine'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A117_WoodCarrier'
import '../../shared/cards/B/B149_OpenAirFarmer'

const CARD_ID = 'B003_Moonshine'
const OCC_A = 'A116_WoodCutter'
const OCC_B = 'A117_WoodCarrier'
const OCC_EXTRA_COST = 'B149_OpenAirFarmer'

/** Build a standard 2-player session in round 1, p0 current player.
 *  p0 has B003_Moonshine in minorHand and [OCC_A, OCC_B] in occupationHand.
 *  food is configurable (default 3).
 */
const makeSession = (opts: {
  food?: number
  gameSeed?: number
  occupationHand?: string[]
  playerCount?: number
  consumedStables?: number
} = {}) => {
  const {
    food = 3,
    gameSeed = 42,
    occupationHand = [OCC_A, OCC_B],
    playerCount = 2,
    consumedStables = 0,
  } = opts
  const session = new GameSession(gameSeed, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, 2)
  setWorkersAtHome(state, p0, 2)
  p0.minorHand = [CARD_ID]
  p0.occupationHand = occupationHand
  p0.resources.food = food
  p0.supplyTokensConsumed = consumedStables > 0 ? { stable: consumedStables } : {}

  state.players.slice(1).forEach((player) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5
  })

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
  const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.sourceCard === CARD_ID) return resp
  if (!resp.state.players[0]!.minorHand.includes(CARD_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  // Choose to play B003_Moonshine
  return session.resolveChoice(0, cardOption!.value)
}

const playB3AfterFamilyGrowth = (session: GameSession) => {
  let resp = session.takeAction(0, 'wish-children')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  expect(improvementOption).toBeDefined()
  resp = session.resolveChoice(0, improvementOption!.value)
  if (resp.interaction.sourceCard === CARD_ID) return resp
  if (!resp.state.players[0]!.minorHand.includes(CARD_ID)) return resp
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

// ---------------------------------------------------------------------------
// Case 1: onBuy emits a pending choice with {play, pass} options
// ---------------------------------------------------------------------------
describe('B003_Moonshine session', () => {
  it('keeps the revealed occupation private after Moonshine passes to the next player', () => {
    const session = makeSession({ food: 3, gameSeed: 42 })
    const response = playB3(session)
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected revealed choice')
    const pick = response.interaction.promptParams?.cardId
    expect([OCC_A, OCC_B]).toContain(pick)
    const [owner, opponent] = response.state.players
    expect(opponent!.minorHand).toContain(CARD_ID)
    expect(JSON.stringify(session.buildSyncPayload(response, owner!.id))).toContain(String(pick))
    for (const viewer of [opponent!.id, null]) {
      expect(JSON.stringify(session.buildSyncPayload(response, viewer))).not.toContain(String(pick))
    }
    expect(owner!.resources.food).toBe(3)
    expect(owner!.occupationPlayed).toEqual([])
  })

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
    const optionValues = resp.interaction.request.options?.map((o) => o.value).sort()
    expect(optionValues).toEqual(['pass', 'play'])

    // The random pick should be cached in cardStates
    const p0 = resp.state.players[0]!
    const cachedOcc = p0.cardStates?.[CARD_ID]?.privateData?.occ
    expect(cachedOcc === OCC_A || cachedOcc === OCC_B).toBe(true)
    expect(resp.interaction.promptParams).toEqual({ cardId: cachedOcc })

    const ownerInteraction = session.buildSyncPayload(resp, p0.id).interaction
    expect(ownerInteraction.stateId === 'wait' && ownerInteraction.promptParams).toEqual({ cardId: cachedOcc })
    const otherInteraction = session.buildSyncPayload(resp, resp.state.players[1]!.id).interaction
    expect(otherInteraction.stateId === 'wait' && otherInteraction.request.kind).toBe('private-prompt')
    expect(JSON.stringify(otherInteraction)).not.toContain(String(cachedOcc))

    expect(p0.minorHand).not.toContain(CARD_ID)
    expect(p0.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)

    // Food should NOT be deducted yet (deduction happens on resolveChoice('play'))
    expect(p0.resources.food).toBe(3)
  })

  it('empty occupation hand produces no play-or-pass choice', () => {
    const session = makeSession()
    session.state.players[0]!.occupationHand = []
    const resp = playB3(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.occupationHand).toEqual([])
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
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

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ as string | undefined
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

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ as string | undefined
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

    const playOption = b3Resp.interaction.request.options?.find((o) => o.value === 'play')
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

  it('enables the same revealed occupation after cooking in a restored purchase window', () => {
    let session = makeSession({ food: 1, occupationHand: [OCC_A] })
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1']
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    const offered = playB3(session)
    expect(offered.interaction.request.options.find((option) => option.value === 'play')?.disabled).toBe(true)
    const snapshot = serializeSessionSnapshot(session.state, session)
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const cooking = response.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep === 1)!
    response = session.resolveChoice(0, cooking.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.interaction.request.options.find((option) => option.value === 'play')?.disabled).not.toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.privateData?.occ).toBe(OCC_A)
    const beforeReads = JSON.stringify({ events: response.state.events, log: response.state.log, scores: response.scores })
    session.getState()
    const read = session.getState()
    expect(JSON.stringify({ events: read.state.events, log: read.state.log, scores: read.scores })).toBe(beforeReads)
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'cancel')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 1 })
    expect(response.interaction.request.options.find((option) => option.value === 'play')?.disabled).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.privateData?.occ).toBe(OCC_A)
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, cooking.value)
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'play')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.occupationPlayed.filter((id) => id === OCC_A)).toHaveLength(1)
  })

  it('returns a blocked B149 play to the same revealed B3 choice', () => {
    const session = makeSession({
      food: 2,
      occupationHand: [OCC_EXTRA_COST],
      playerCount: 4,
      consumedStables: 3,
    })
    const b3Resp = playB3(session)
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return
    expect(b3Resp.interaction.request.options?.find((option) => option.value === 'play')?.disabled).not.toBe(true)
    const revealed = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ
    expect(revealed).toBe(OCC_EXTRA_COST)
    const beforeEvents = structuredClone(b3Resp.state.events)
    const beforeLog = structuredClone(b3Resp.state.log)
    const beforeScores = structuredClone(b3Resp.scores)

    const playResp = session.resolveChoice(0, 'play')
    expect(playResp.ok).toBe(true)
    expect(playResp.interaction.stateId).toBe('wait')
    if (playResp.interaction.stateId !== 'wait') return
    expect(playResp.interaction.request.kind).toBe('engine-blocked')
    expect(session.createSessionPrivateCursor().provisionalContinuationScopes).toEqual(
      expect.arrayContaining([expect.objectContaining({ fallbackCommand: 'undoAction' })]),
    )
    expect(playResp.interaction.allowedCommands).toEqual(['undoAction'])
    expect(playResp.state.players[0]!.occupationPlayed).toContain(OCC_EXTRA_COST)
    expect(playResp.state.players[0]!.resources.food).toBe(0)
    expect(playResp.state.players[0]!.supplyTokensConsumed?.stable).toBe(3)
    expect(playResp.state.players[0]!.fenceSegments).toHaveLength(0)

    const fallback = session.undoAction()
    expect(fallback.ok).toBe(true)
    expect(fallback.interaction.stateId).toBe('wait')
    if (fallback.interaction.stateId !== 'wait') return
    expect(fallback.interaction.sourceCard).toBe(CARD_ID)
    expect(fallback.interaction.promptKey).toBe('cards.B003_Moonshine.choice')
    expect(fallback.interaction.promptParams).toEqual({ cardId: revealed })
    expect(fallback.interaction.request.options?.map((option) => option.value).sort()).toEqual(['pass', 'play'])

    const restored = fallback.state.players[0]!
    expect(restored.cardStates?.[CARD_ID]?.privateData?.occ).toBe(revealed)
    expect(restored.occupationHand).toContain(OCC_EXTRA_COST)
    expect(restored.occupationPlayed).not.toContain(OCC_EXTRA_COST)
    expect(restored.resources.food).toBe(2)
    expect(restored.supplyTokensConsumed?.stable).toBe(3)
    expect(restored.fenceSegments).toHaveLength(0)
    expect(restored.pastures).toHaveLength(0)
    expect(restored.minorHand).not.toContain(CARD_ID)
    expect(fallback.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(workersAvailable(fallback.state, restored)).toBe(1)
    expect(fallback.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toEqual([expect.objectContaining({ playerId: restored.id })])
    expect(fallback.state.events.filter((event) => event.type !== 'continuation.restored')).toEqual(beforeEvents)
    expect(fallback.state.log.filter((entry) => entry.key !== 'log.provisionalContinuationRollback')).toEqual(beforeLog)
    expect(fallback.scores).toEqual(beforeScores)
    expect(fallback.interaction.rejectedCommandKeys).toContain(authoritativeCommandKey(
      'choice',
      0,
      { value: 'play', payload: undefined },
    ))

    expect(session.undoStep()).toMatchObject({ ok: false, error: 'cannot undo past boundary' })
    expect(session.resolveChoice(0, 'play')).toMatchObject({
      ok: false,
      error: 'command unavailable until game state changes',
    })

    const passResp = session.resolveChoice(0, 'pass')
    expect(passResp.ok).toBe(true)
    expect(passResp.state.players[0]!.occupationHand).not.toContain(OCC_EXTRA_COST)
    expect(passResp.state.players[1]!.occupationHand).toContain(OCC_EXTRA_COST)
  })

  it('case 5: solo game — pass discards the picked occupation', () => {
    const session = makeSession({ food: 3, occupationHand: [OCC_A], playerCount: 1 })
    const state = session.getState().state
    state.round = 14
    state.currentPlayerIndex = 0
    const p0 = state.players[0]!
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    p0.rooms = 3
    p0.minorHand = [CARD_ID]
    p0.occupationHand = [OCC_A]
    p0.resources.food = 3
    session.loadState(state)

    const b3Resp = playB3AfterFamilyGrowth(session)
    expect(b3Resp.interaction.stateId).toBe('wait')
    if (b3Resp.interaction.stateId !== 'wait') return

    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ as string | undefined
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

    const pick1 = resp1.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ
    const pick2 = resp2.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ

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
    const pickBefore = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ
    expect(pickBefore).toBeDefined()

    // undoStep should be blocked because the boundary was set during the roll
    const undoResp = session.undoStep()
    // With the boundary flag, undoStep must return ok:false
    expect(undoResp.ok).toBe(false)
    expect(undoResp.error).toBe('cannot undo past boundary')
    expect(session.undoAction()).toMatchObject({ ok: false, error: 'cannot undo past boundary' })

    // The cached pick must still be present (boundary held)
    const stateAfterUndo = session.getState().state
    const pickAfter = stateAfterUndo.players[0]?.cardStates?.[CARD_ID]?.privateData?.occ
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
    const pickedOcc = b3Resp.state.players[0]!.cardStates?.[CARD_ID]?.privateData?.occ
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

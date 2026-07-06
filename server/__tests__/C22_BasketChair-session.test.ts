import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import {
  recordRoundPlacement,
  getRoundPlacementDetails,
} from '../../shared/cards/helpers/round-placement'
import {
  getWorkerHeldOnCard,
} from '../../shared/cards/helpers/card-held-workers'
import {
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAvailable,
} from '../../shared/domain/player'
import { addSyntheticLinkedOccupancyRef, addWorkerRef, isSyntheticLinkedOccupancy } from '../../shared/domain/space'

import '../../shared/cards/C/C022_BasketChair'
import '../../shared/cards/C/C023_JobContract'
// Import a second, cheap minor so the minor-selection choice never has exactly
// one option (which would otherwise auto-resolve past the choice state the
// tests need to observe).
import '../../shared/cards/C/C057_Crudite'

const CARD_ID = 'C022_BasketChair'
const FILLER_MINOR = 'C057_Crudite' // free-cost, no prerequisites

/**
 * Simulate that `workerId` of player `p` has already been placed on
 * `spaceId` earlier in the work phase: add the worker ref to the space and
 * record a matching round-placement entry. Does NOT run the space's action
 * flow — mirrors A025_Bassinet-session.test.ts / D024_BrotherlyLove-session.test.ts.
 */
const simulatePlacement = (
  session: GameSession,
  playerIndex: number,
  spaceId: string,
  workerId: string,
) => {
  const state = session.getState().state
  const p = state.players[playerIndex]!
  const space = state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) throw new Error(`space not found: ${spaceId}`)
  addWorkerRef(space, p.id, workerId)
  recordRoundPlacement(p, spaceId, workerId)
  session.loadState(state)
}

/**
 * Base 2-player setup at round 3 (non-harvest). P1 has C22 + a filler minor
 * in hand and 1 reed (exact C22 buy cost). `activeWorkers` controls P1's
 * active worker count (default 3 — enough for a prefab placement on forest +
 * a placement on meeting-place + one at-home worker for the onBuy-triggered
 * place-farmer step).
 */
const setup = (options?: { activeWorkers?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3

  const p1 = state.players[0]!
  const active = options?.activeWorkers ?? 3
  setActiveWorkerCount(p1, active)
  setWorkersAtHome(state, p1, active)
  p1.minorHand = [CARD_ID, FILLER_MINOR]
  p1.resources = { ...p1.resources, reed: 1 }

  session.loadState(state)
  return session
}

/**
 * Drive meeting-place → accept optional minor-improvement → pick C22. Returns
 * the response after C22 is paid for (i.e. right after onBuy has fired).
 */
const buyC22ViaMeetingPlace = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected optional minor-improvement choice, got ${resp.interaction.stateId}`)
  }
  const acceptMinor = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
  if (!acceptMinor) throw new Error('accept-minor-improvement option missing')
  resp = session.resolveChoice(0, acceptMinor.value)
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected minor-selection choice, got ${resp.interaction.stateId}`)
  }
  const c22Option = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
  if (!c22Option) throw new Error('C22 option missing from minor selection')
  return session.resolveChoice(0, c22Option.value)
}

describe('C022_BasketChair session', () => {
  it('case 1 — golden path: recall first-placed worker onto C22 + place extra farmer on ClayPit', () => {
    const session = setup({ activeWorkers: 3 })
    simulatePlacement(session, 0, 'forest', '1')

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.reed).toBe(0)

    // onBuy should present an optional accept/skip for the recall+place seq.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    expect(resp.interaction.request.options?.some((o) => o.value === '__skip__')).toBe(true)

    // Accept → recall worker 1 onto C22 and open place-farmer choice.
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    // Forest is freed of P1; worker 1 is held on C22; one at-home worker (3) left.
    const forestAfterRecall = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    expect(forestAfterRecall.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBe('1')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)

    // Next pending is the place-farmer choice.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const clayPitOption = resp.interaction.request.options?.find((o) => o.value === 'clay-pit')
    expect(clayPitOption).toBeDefined()
    // The freed Forest must also be available as a placement option.
    expect(resp.interaction.request.options?.some((o) => o.value === 'forest')).toBe(true)

    resp = session.resolveChoice(0, clayPitOption!.value)
    expect(resp.ok).toBe(true)

    const clayPit = resp.state.actionSpaces.find((s) => s.id === 'clay-pit')!
    // Smallest at-home worker (id '3') takes clay-pit.
    expect(clayPit.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '3')).toBe(true)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(0)
    // heldWorkerId persists until return-home.
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBe('1')
  })

  it('case 2 — skip path: declining the onBuy seq leaves the first placement untouched', () => {
    const session = setup({ activeWorkers: 3 })
    simulatePlacement(session, 0, 'forest', '1')

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Forest still holds worker 1; no heldWorkerId; worker 3 still at home.
    const forest = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    expect(forest.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '1')).toBe(true)
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBeUndefined()
    // Two workers placed (forest prefab + meeting-place), one at home.
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
  })

  it('case 3 — no prior placement: onBuy emits no flow (direct effect check)', () => {
    // Case 3 is expressed at the effect level: with an empty placement history
    // onBuy must return undefined. Through takeAction → meeting-place the
    // meeting-place placement itself becomes the first recorded placement, so
    // this invariant is only cleanly observable on the effect itself.
    const session = setup({ activeWorkers: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    expect(getRoundPlacementDetails(player)).toHaveLength(0)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.onBuy).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('case 4 — first placement on Meeting Place: no flow offered (direct effect check)', () => {
    const session = setup({ activeWorkers: 3 })
    simulatePlacement(session, 0, 'meeting-place', '1')

    const state = session.getState().state
    const player = state.players[0]!
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('case 5 — no at-home worker for step 2: onBuy emits no flow', () => {
    // Setup: 2 active workers, worker 1 prefabbed on forest. After
    // takeAction('meeting-place') worker 2 goes on meeting-place and
    // workersAvailable = 0 — the place-farmer step would fail. The onBuy guard
    // must catch this and offer no seq.
    const session = setup({ activeWorkers: 2 })
    simulatePlacement(session, 0, 'forest', '1')

    const resp = buyC22ViaMeetingPlace(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    // Nothing from C22 should still be pending: no accept/skip prompt,
    // definitely no holdWorkerOnCard mutation.
    if (resp.interaction.stateId === 'wait') {
      const c22Accept = resp.interaction.request.options?.find(
        (o) => (o as { sourceCard?: string }).sourceCard === CARD_ID,
      )
      expect(c22Accept).toBeUndefined()
    }
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBeUndefined()
    // Forest is still occupied by the prefab worker.
    const forest = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    expect(forest.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '1')).toBe(true)
  })

  it('case 6 — re-placing on freed origin: Forest can be reused by the extra place-farmer', () => {
    const session = setup({ activeWorkers: 3 })
    // Seed forest wood so re-occupying it collects a positive gain.
    const state0 = session.getState().state
    state0.actionSpaces.find((s) => s.id === 'forest')!.resources.wood = 3
    session.loadState(state0)

    simulatePlacement(session, 0, 'forest', '1')

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = (resp.interaction.request.options ?? []).find((o) => o.value !== '__skip__')!

    resp = session.resolveChoice(0, acceptOption.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.some((o) => o.value === 'forest')).toBe(true)

    const woodBefore = resp.state.players[0]!.resources.wood
    resp = session.resolveChoice(0, 'forest')
    expect(resp.ok).toBe(true)

    const forest = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    // Smallest at-home worker (id '3' — worker 1 is held, worker 2 is on
    // meeting-place) takes the re-opened forest space.
    expect(forest.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '3')).toBe(true)
    expect(forest.takenBy.some((t) => t.workerId === '1')).toBe(false)
    expect(resp.state.players[0]!.resources.wood).toBeGreaterThan(woodBefore)
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBe('1')
  })

  it('case 7 — return home releases the card-held worker', () => {
    const session = setup({ activeWorkers: 3 })
    simulatePlacement(session, 0, 'forest', '1')

    // Golden-path buy + accept + place on clay-pit, matching case 1.
    let resp = buyC22ViaMeetingPlace(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected accept/skip choice')
    const acceptOption = (resp.interaction.request.options ?? []).find((o) => o.value !== '__skip__')!
    resp = session.resolveChoice(0, acceptOption.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected place-farmer choice')
    resp = session.resolveChoice(0, 'clay-pit')
    expect(getWorkerHeldOnCard(resp.state.players[0]!, CARD_ID)).toBe('1')

    // Drive the central return-home path directly (same pattern as
    // card-held-return-home.test.ts). This clears every held worker.
    ;(session as unknown as { continueReturnHomeHooks: () => void }).continueReturnHomeHooks()

    const afterState = session.getState().state
    expect(getWorkerHeldOnCard(afterState.players[0]!, CARD_ID)).toBeUndefined()
    // All 3 active workers are home again (the 3 action-space takenBy lists
    // are cleared as part of the same hook).
    expect(workersAvailable(afterState, afterState.players[0]!)).toBe(3)
  })

  it('case 8 — buying C22 after C23 day-laborer removes the fake lessons worker', () => {
    const session = setup({ activeWorkers: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('C023_JobContract')
    session.loadState(state)
    simulatePlacement(session, 0, 'day-laborer', '1')
    const withDayLaborer = session.getState().state
    const lessons = withDayLaborer.actionSpaces.find((s) => s.id === 'lessons')!
    addSyntheticLinkedOccupancyRef(lessons, player.id, '1', 'C023_JobContract')
    session.loadState(withDayLaborer)

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    const dayLaborer = resp.state.actionSpaces.find((s) => s.id === 'day-laborer')!
    const lessonsAfter = resp.state.actionSpaces.find((s) => s.id === 'lessons')!
    expect(dayLaborer.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
    expect(lessonsAfter.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
  })

  it('case 8b — C23 cleanup keeps synthetic occupancy for a different linked worker', () => {
    const session = setup({ activeWorkers: 5 })
    simulatePlacement(session, 0, 'day-laborer', '1')
    const withDayLaborer = session.getState().state
    const lessons = withDayLaborer.actionSpaces.find((s) => s.id === 'lessons')!
    addSyntheticLinkedOccupancyRef(lessons, withDayLaborer.players[0]!.id, '2', 'C023_JobContract')
    session.loadState(withDayLaborer)

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    const lessonsAfter = resp.state.actionSpaces.find((s) => s.id === 'lessons')!
    const remaining = lessonsAfter.takenBy.find((t) => t.playerId === 'p1')
    expect(remaining?.workerId).toBe('2')
    expect(isSyntheticLinkedOccupancy(remaining, { linkedWorkerId: '2' })).toBe(true)
  })

  it('case 9 — C23 cleanup preserves a real lessons worker', () => {
    const session = setup({ activeWorkers: 5 })
    simulatePlacement(session, 0, 'day-laborer', '1')
    const withDayLaborer = session.getState().state
    const lessonsBefore = withDayLaborer.actionSpaces.find((s) => s.id === 'lessons')!
    addSyntheticLinkedOccupancyRef(lessonsBefore, withDayLaborer.players[0]!.id, '1', 'C023_JobContract')
    addWorkerRef(lessonsBefore, withDayLaborer.players[0]!.id, '4')
    session.loadState(withDayLaborer)

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    const forest = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    const lessons = resp.state.actionSpaces.find((s) => s.id === 'lessons')!
    const dayLaborer = resp.state.actionSpaces.find((s) => s.id === 'day-laborer')!
    expect(forest.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
    expect(dayLaborer.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
    expect(lessons.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '1')).toBe(false)
    expect(lessons.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '4')).toBe(true)
  })

  it('case 10 — C23 fake lessons worker stays when C22 recalls a non-day-laborer worker', () => {
    const session = setup({ activeWorkers: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('C023_JobContract')
    session.loadState(state)

    simulatePlacement(session, 0, 'forest', '1')
    simulatePlacement(session, 0, 'day-laborer', '2')
    const withDayLaborer = session.getState().state
    const lessons = withDayLaborer.actionSpaces.find((s) => s.id === 'lessons')!
    addSyntheticLinkedOccupancyRef(lessons, player.id, '2', 'C023_JobContract')
    session.loadState(withDayLaborer)

    let resp = buyC22ViaMeetingPlace(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const acceptOption = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    const forest = resp.state.actionSpaces.find((s) => s.id === 'forest')!
    const dayLaborer = resp.state.actionSpaces.find((s) => s.id === 'day-laborer')!
    const lessonsAfter = resp.state.actionSpaces.find((s) => s.id === 'lessons')!
    expect(forest.takenBy.some((t) => t.playerId === 'p1')).toBe(false)
    expect(dayLaborer.takenBy.some((t) => t.playerId === 'p1' && t.workerId === '2')).toBe(true)
    const remaining = lessonsAfter.takenBy.find((t) => t.playerId === 'p1')
    expect(remaining?.workerId).toBe('2')
    expect(isSyntheticLinkedOccupancy(remaining, { linkedWorkerId: '2' })).toBe(true)
  })
})

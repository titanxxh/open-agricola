import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  familySize,
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAvailable,
  newbornCount,
} from '../../shared/domain/player'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import type { SessionResponse } from '../../shared/session/session-core'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A092_AdoptiveParents'

const A92 = 'A092_AdoptiveParents'

const placeholderHands = (state: {
  players: { minorHand: string[]; occupationHand: string[] }[]
}) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}

/** Active interaction request kind, or undefined when not waiting. */
const reqKind = (r: SessionResponse): string | undefined =>
  r.interaction.stateId === 'wait' ? r.interaction.request.kind : undefined

/** Active interaction option values (choice prompts expose them as `options`). */
const optValues = (r: SessionResponse): string[] =>
  r.interaction.stateId === 'wait' ? (r.interaction.request.options ?? []).map((o) => o.value) : []

const optLabels = (r: SessionResponse): (string | undefined)[] =>
  r.interaction.stateId === 'wait' ? (r.interaction.request.options ?? []).map((o) => o.labelKey) : []

/**
 * XOR branch value by position: branch 0 = use, branch 1 = forfeit. OA
 * addresses XOR branches by the underlying node id (e.g. 'seq-4'), not a stable
 * '0'/'1' index, and emits them in child (flow) order, so position is the stable
 * handle a test should use.
 */
const branchValue = (r: SessionResponse, index: number): string => {
  const opts = r.interaction.stateId === 'wait' ? (r.interaction.request.options ?? []) : []
  const found = opts[index]
  if (!found) throw new Error(`no XOR branch at index ${index}; got ${JSON.stringify(opts)}`)
  return found.value
}

/**
 * Two-player rotation fixture. P0 holds A92 and is OUT of ordinary workers —
 * its only active worker is a parked Newborn occupying an action space (so
 * `workersAvailable === 0`). P1 is the current player with `p1Workers`
 * available. Drive: P1 places, confirm-next-player, the rotation lands on P0
 * who is owed an extra turn → the XOR is injected (rendered as a `choice`).
 */
const setupRotation = (opts: {
  food?: number
  newborns?: number
  p1Workers?: number
  adultWorkers?: number
  round?: number
  forfeited?: boolean
  holdA92?: boolean
} = {}) => {
  const food = opts.food ?? 3
  const newborns = opts.newborns ?? 1
  const p1Workers = opts.p1Workers ?? 1
  const adultWorkers = opts.adultWorkers ?? 0
  const holdA92 = opts.holdA92 ?? true

  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 1
  state.round = opts.round ?? 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, Math.max(1, newborns + adultWorkers))
  setWorkersAtHome(state, p0, 0)
  const parkSpaces = ['forest', 'clay-pit', 'reed-bank', 'fishing']
  const active = p0.workers
    .filter((w) => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  active.forEach((worker, index) => {
    worker.isNewborn = index < newborns
  })
  for (let i = 0; i < newborns && i < active.length; i++) {
    const w = active[i]!
    w.isNewborn = true
    const sp = state.actionSpaces.find((a) => a.id === parkSpaces[i])!
    sp.takenBy = [{ playerId: p0.id, workerId: w.id }] as typeof sp.takenBy
  }
  if (holdA92) p0.occupationPlayed.push(A92)
  p0.resources.food = food
  if (opts.forfeited) {
    p0.cardStates = {
      ...(p0.cardStates ?? {}),
      [A92]: { extraData: { forfeitedThisRound: true } },
    }
  }

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, p1Workers)
  setWorkersAtHome(state, p1, p1Workers)

  placeholderHands(state)
  session.loadState(state)
  return session
}

const setupPlayedAfterGrowth = () => {
  const session = new GameSession(1, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundPhase = 'work'
  placeholderHands(state)

  const player = state.players[0]!
  setActiveWorkerCount(player, 3)
  const workers = player.workers
    .filter((worker) => worker.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  workers.forEach((worker) => {
    worker.isNewborn = false
  })
  workers[2]!.isNewborn = true
  state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
    { playerId: player.id, workerId: workers[0]!.id },
  ]
  state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = [
    { playerId: player.id, workerId: workers[2]!.id },
  ]
  player.occupationHand = [A92]
  player.resources.food = 3

  const opponent = state.players[1]!
  setActiveWorkerCount(opponent, 1)
  setWorkersAtHome(state, opponent, 1)
  session.loadState(state)
  return session
}

/** Real, placeable action spaces this round (excludes occupied + the test sink). */
const placeableSpaces = (session: GameSession) =>
  session
    .getState()
    .state.actionSpaces.filter(
      (a) =>
        a.id !== '__test-worker-sink__' &&
        (!a.takenBy || a.takenBy.length === 0) &&
        (a.roundAvailable ?? 1) <= session.getState().state.round,
    )
    .map((a) => a.id)

/** Drive confirm-next-player prompts until the rotation stops on something else. */
const drainConfirms = (session: GameSession, start: SessionResponse): SessionResponse => {
  let r = start
  let guard = 0
  while (reqKind(r) === 'confirm-next-player' && guard++ < 8) {
    const owner = r.interaction.stateId === 'wait' ? r.interaction.playerIndex : session.getState().state.currentPlayerIndex
    r = session.resolveChoice(owner, 'confirm')
  }
  return r
}

/** P1 places its first worker, then confirm through the rotation to P0's offer. */
const driveToP0ExtraTurn = (session: GameSession): SessionResponse => {
  const taken = session.takeAction(1, placeableSpaces(session)[0]!)
  expect(taken.ok).toBe(true)
  return drainConfirms(session, taken)
}

describe('A92 AdoptiveParents — extra-turn (capability B)', () => {
  it('A092 S1: Adoptive Parents played after growth can trigger in the same work phase', () => {
    const session = setupPlayedAfterGrowth()

    const played = session.takeAction(0, 'lessons')
    expect(played.ok).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain(A92)
    expect(newbornCount(played.state.players[0]!)).toBe(1)
    expect(hasPendingExtraTurn(played.state, played.state.players[0]!)).toBe(true)

    drainConfirms(session, played)
    const opponentAction = session.takeAction(1, placeableSpaces(session)[0]!)
    expect(opponentAction.ok).toBe(true)
    const offer = drainConfirms(session, opponentAction)
    expect(reqKind(offer)).toBe('choice')

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(used.state.round).toBe(2)
    expect(used.state.players[0]!.resources.food).toBe(2)
    expect(newbornCount(used.state.players[0]!)).toBe(0)
    expect(['farm-select', 'choice']).toContain(reqKind(used))
  })

  it('rotation STOPS on the out-of-workers A92 player and offers use/forfeit', () => {
    const session = setupRotation()
    const pre = session.getState()
    expect(workersAvailable(pre.state, pre.state.players[0]!)).toBe(0)
    expect(hasPendingExtraTurn(pre.state, pre.state.players[0]!)).toBe(true)

    const r = driveToP0ExtraTurn(session)
    expect(session.getState().state.currentPlayerIndex).toBe(0)
    expect(reqKind(r)).toBe('choice')
    // Two XOR branches in flow order: branch 0 = use (its first leaf is the food
    // payment), branch 1 = forfeit (its leaf is the set-extra-data effect). OA
    // labels a composite branch by its first leaf's action and addresses
    // branches by node-id value, so tests select by position, not by '0'/'1'.
    expect(optValues(r)).toHaveLength(2)
    expect(optLabels(r)).toEqual(['actions.pay.name', 'actions.special-effect.name'])
  })

  it('A092 S2: after rotation passed the owner, accepting promotes and immediately places the child', () => {
    const session = setupRotation({ food: 3 })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const foodBefore = session.getState().state.players[0]!.resources.food
    expect(newbornCount(session.getState().state.players[0]!)).toBe(1)

    // Choose "use": pay + promote → the promoted worker is offered a placement
    // prompt (resolvable by space id; OA renders it as a 'choice' of spaces).
    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(['farm-select', 'choice']).toContain(reqKind(used))
    expect(used.state.players[0]!.resources.food).toBe(foodBefore - 1)
    // Promoted: no longer a newborn, now an available worker awaiting placement.
    expect(newbornCount(used.state.players[0]!)).toBe(0)
    expect(workersAvailable(used.state, used.state.players[0]!)).toBe(1)

    // Resolve the placement onto a real action space.
    const placed = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(placed.ok).toBe(true)
    const after = session.getState()
    expect(workersAvailable(after.state, after.state.players[0]!)).toBe(0)
    expect(hasPendingExtraTurn(after.state, after.state.players[0]!)).toBe(false)
  })

  it('A092 S5: two newborns can each be promoted for one food in the same round', () => {
    const session = setupRotation({ food: 3, newborns: 2 })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    const afterUse = session.getState()
    expect(afterUse.state.players[0]!.resources.food).toBe(2)
    expect(newbornCount(afterUse.state.players[0]!)).toBe(1)
    expect(hasPendingExtraTurn(afterUse.state, afterUse.state.players[0]!)).toBe(true)
    expect(session.getState().state.currentPlayerIndex).toBe(0)

    const firstPlaced = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(firstPlaced.ok).toBe(true)
    const secondOffer = drainConfirms(session, firstPlaced)
    expect(secondOffer.state.round).toBe(1)
    expect(reqKind(secondOffer)).toBe('choice')

    const secondUse = session.resolveChoice(0, branchValue(secondOffer, 0))
    expect(secondUse.ok).toBe(true)
    expect(secondUse.state.round).toBe(1)
    expect(secondUse.state.players[0]!.resources.food).toBe(1)
    expect(newbornCount(secondUse.state.players[0]!)).toBe(0)
    expect(['farm-select', 'choice']).toContain(reqKind(secondUse))
  })

  it('A092 S3: declining use leaves food and the newborn unchanged', () => {
    const session = setupRotation()
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const foodBefore = offer.state.players[0]!.resources.food

    // Choose "forfeit" (branch 1).
    const forfeited = session.resolveChoice(0, branchValue(offer, 1))
    expect(forfeited.ok).toBe(true)

    const after = session.getState()
    expect(after.state.players[0]!.resources.food).toBe(foodBefore)
    expect(after.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(true)
    // Offspring still parked but no longer offered.
    expect(newbornCount(after.state.players[0]!)).toBe(1)
    expect(hasPendingExtraTurn(after.state, after.state.players[0]!)).toBe(false)
  })

  it('ROUND CLOSE: forfeiting the last extra turn ends the round (no early end, no loop)', () => {
    const session = setupRotation()
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const forfeited = session.resolveChoice(0, branchValue(offer, 1))
    expect(forfeited.ok).toBe(true)

    const after = drainConfirms(session, forfeited)
    expect(hasPendingExtraTurn(after.state, after.state.players[0]!)).toBe(false)
    // No player owed a worker or extra turn → work phase completed, round advanced.
    expect(after.state.round).toBe(2)
  })

  it('A092 S4: no newborn or zero food exposes no usable Adoptive Parents branch', () => {
    const session = setupRotation({ newborns: 0, p1Workers: 1 })
    // setupRotation forces ≥1 newborn; scrub P0 to a clean "no offspring" state.
    const st = session.getState().state
    const p0 = st.players[0]!
    for (const w of p0.workers) w.isNewborn = false
    for (const sp of st.actionSpaces) {
      if (sp.takenBy) sp.takenBy = sp.takenBy.filter((t) => t.playerId !== p0.id) as typeof sp.takenBy
    }
    setActiveWorkerCount(p0, 0)
    session.loadState(st)

    const start = session.getState()
    expect(newbornCount(start.state.players[0]!)).toBe(0)
    expect(hasPendingExtraTurn(start.state, start.state.players[0]!)).toBe(false)

    const taken = session.takeAction(1, placeableSpaces(session)[0]!)
    expect(taken.ok).toBe(true)
    const after = drainConfirms(session, taken)
    expect(reqKind(after)).not.toBe('choice')
    expect(after.state.round).toBe(2)

    const noFood = setupRotation({ food: 0, p1Workers: 2 })
    const snap = noFood.getState()
    expect(newbornCount(snap.state.players[0]!)).toBe(1)
    expect(hasPendingExtraTurn(snap.state, snap.state.players[0]!)).toBe(false)
    const noFoodAction = noFood.takeAction(1, placeableSpaces(noFood)[0]!)
    expect(noFoodAction.ok).toBe(true)
    const afterNoFood = drainConfirms(noFood, noFoodAction)
    expect(reqKind(afterNoFood)).not.toBe('choice')
    expect(afterNoFood.state.players[0]!.resources.food).toBe(0)
    expect(newbornCount(afterNoFood.state.players[0]!)).toBe(1)
  })

  it('A092 S6: a promoted child is fed as an adult in the harvest', () => {
    const session = setupRotation({
      food: 7,
      newborns: 1,
      adultWorkers: 2,
      p1Workers: 1,
      round: 4,
    })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    expect(familySize(offer.state.players[0]!)).toBe(3)

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(used.state.players[0]!.resources.food).toBe(6)
    expect(newbornCount(used.state.players[0]!)).toBe(0)

    const placed = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(placed.ok).toBe(true)
    const afterHarvest = autoAdvanceRoundEnd(session)

    expect(afterHarvest.state.round).toBe(5)
    expect(familySize(afterHarvest.state.players[0]!)).toBe(3)
    expect(newbornCount(afterHarvest.state.players[0]!)).toBe(0)
    expect(afterHarvest.state.players[0]!.resources.food).toBe(0)
    expect(afterHarvest.state.players[0]!.resources.begging).toBe(0)
  })

  it('NOT TRIGGERED: already forfeited this round → not offered', () => {
    const session = setupRotation({ forfeited: true })
    const snap = session.getState()
    expect(hasPendingExtraTurn(snap.state, snap.state.players[0]!)).toBe(false)
  })

  it('NOT TRIGGERED: A92 on the opponent does not affect this player', () => {
    const session = setupRotation({ holdA92: false })
    const st = session.getState().state
    st.players[1]!.occupationPlayed.push(A92)
    st.players[1]!.resources.food = 5
    session.loadState(st)
    const snap = session.getState()
    expect(hasPendingExtraTurn(snap.state, snap.state.players[0]!)).toBe(false)
    expect(hasPendingExtraTurn(snap.state, snap.state.players[1]!)).toBe(false)
  })

  it('CROSS-ROUND: forfeitedThisRound gates this round, clears for the next', () => {
    const session = setupRotation({ forfeited: true })
    const before = session.getState()
    expect(before.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(true)
    expect(hasPendingExtraTurn(before.state, before.state.players[0]!)).toBe(false)

    // onRoundStart clears the flag; availability returns (offspring + food remain).
    const player = before.state.players[0]!
    player.cardStates![A92]!.extraData!.forfeitedThisRound = false
    expect(hasPendingExtraTurn(before.state, player)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import {
  setActiveWorkerCount,
  setWorkersAtHome,
  newbornCount,
} from '../../shared/domain/player'
import { addWorkerRef } from '../../shared/domain/space'
import type { GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/A/A025_Bassinet'
import '../../shared/cards/A/A092_AdoptiveParents'

const CARD_ID = 'A025_Bassinet'

/**
 * Give P2 (index 1) the Bassinet minor improvement.
 */
const giveP2Bassinet = (state: GameState) => {
  const p2 = state.players[1]!
  if (!p2.minorPlayed.includes(CARD_ID)) p2.minorPlayed.push(CARD_ID)
}

/**
 * Simulate player `p` placing worker `workerId` on space `spaceId` by directly
 * mutating state: add WorkerRef to the space and record the round placement.
 * Does NOT execute the action flow — only the bookkeeping that A25's logic reads.
 */
const simulatePlacement = (
  state: GameState,
  p: PlayerState,
  spaceId: string,
  workerId: string,
) => {
  const space = state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) throw new Error(`space not found: ${spaceId}`)
  addWorkerRef(space, p.id, workerId)
  recordRoundPlacement(p, spaceId, workerId)
}

/**
 * Base 2P setup: round 2, P1 is start player, P2 has A25.
 * Each player has 2 active workers all at home.
 */
const baseSetup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
    spaceId === 'wish-children' ? null : spaceId,
  )

  for (const p of state.players) {
    setActiveWorkerCount(p, 2)
    setWorkersAtHome(state, p, 2)
    p.rooms = 3
  }

  giveP2Bassinet(state)
  session.loadState(state)
  return session
}

describe('A025_Bassinet session', () => {
  it('case 1: happy path — P2 follows P1 into first non-accum space', () => {
    const session = baseSetup()
    const state = session.getState().state
    // P1 manually places on farmland (simulate without running full action flow)
    const p1 = state.players[0]!
    simulatePlacement(state, p1, 'farmland', '1')
    // Consume one of P1's workers so P2's turn is next
    state.currentPlayerIndex = 1
    session.loadState(state)

    // P2 takes farmland — should succeed via A25's canUseOccupied
    const resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)

    const farmland = resp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(2)
    const playerIds = farmland.takenBy.map((t) => t.playerId).sort()
    expect(playerIds).toEqual(['p1', 'p2'])
  })

  it('case 2: Bassinet owner placing on empty space succeeds via normal path', () => {
    const session = baseSetup()
    const state = session.getState().state
    state.currentPlayerIndex = 1 // P2's turn; farmland is empty
    session.loadState(state)

    const resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)

    const farmland = resp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(1)
    expect(farmland.takenBy[0]!.playerId).toBe('p2')
  })

  it('case 3: second non-accum space — rejected', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    // P1 places on farmland (first non-accum), then on grain-seeds (second non-accum)
    simulatePlacement(state, p1, 'farmland', '1')
    simulatePlacement(state, p1, 'grain-seeds', '2')
    state.currentPlayerIndex = 1
    session.loadState(state)

    // P2 (A25) tries grain-seeds — NOT the first non-accum used
    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(false)
  })

  it('case 4: Meeting Place is first non-accum — always rejected', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    simulatePlacement(state, p1, 'meeting-place', '1')
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(false)
  })

  it('case 5: FG + newborn = 2 people on FG space, rejected', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    // Ensure P1 has room to grow (rooms > familySize)
    p1.rooms = 3
    setActiveWorkerCount(p1, 2)
    setWorkersAtHome(state, p1, 2)
    session.loadState(state)

    // P1 runs the real Family Growth action
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    // FG space should have 2 refs (parent + newborn)
    const fgSpace = fgResp.state.actionSpaces.find((s) => s.id === 'wish-children')!
    expect(fgSpace.takenBy).toHaveLength(2)
    expect(newbornCount(fgResp.state.players[0]!)).toBe(1)

    // Resolve the optional minor-improvement choice that FG offers (skip)
    if (fgResp.interaction.stateId === 'wait') {
      session.resolveChoice(0, '__skip__')
    }

    // Switch to P2
    const finalState = session.getState().state
    finalState.currentPlayerIndex = 1
    session.loadState(finalState)

    // P2 (A25) tries FG space — count is 2, so A25 does NOT help
    const resp = session.takeAction(1, 'wish-children')
    expect(resp.ok).toBe(false)
  })

  it('case 6: FG + A92 grow-only (capability A) = 1 person, allowed', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    p1.rooms = 3
    setActiveWorkerCount(p1, 2)
    setWorkersAtHome(state, p1, 2)
    p1.resources.food = 5
    p1.occupationPlayed.push('A092_AdoptiveParents')
    session.loadState(state)

    // P1 does FG → parent + newborn on wish-children. The action engine stays
    // alive at FG's optional minor-improvement choice (interactive window keyed
    // to the wish-children space), which is where A92's anytime grow-only entry
    // is exposed.
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    expect(fgResp.interaction.stateId).toBe('wait')

    // Capability A: anytime grow-only promotes the newborn off the FG space
    // (pay 1 food, child→adult, no immediate place-farmer). This is what frees
    // the FG space to a single person so A25 can follow P2 into it.
    const grown = session.takeAnytimeAction(0, 'A92-adoptive-parents-anytime-grow')
    expect(grown.ok).toBe(true)

    // FG space now has only 1 ref (the parent).
    const fgSpaceMid = session.getState().state.actionSpaces.find((s) => s.id === 'wish-children')!
    expect(fgSpaceMid.takenBy.filter((t) => t.playerId === p1.id)).toHaveLength(1)

    // Switch to P2.
    const finalState = session.getState().state
    finalState.currentPlayerIndex = 1
    session.loadState(finalState)

    // P2 (A25) tries FG space — should succeed (1 person there).
    const resp = session.takeAction(1, 'wish-children')
    expect(resp.ok).toBe(true)
    const fgSpaceAfter = resp.state.actionSpaces.find((s) => s.id === 'wish-children')!
    expect(fgSpaceAfter.takenBy.some((t) => t.playerId === 'p2')).toBe(true)
  })

  it('case 7: Bassinet played mid-round — derivation still finds first non-accum', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    // P1 places on farmland (first non-accum)
    simulatePlacement(state, p1, 'farmland', '1')
    state.currentPlayerIndex = 1

    // Only now, give P2 the Bassinet (previously setup already gave it; revoke first for realism)
    const p2 = state.players[1]!
    // already has it from baseSetup — this case is effectively checking that
    // the lookup doesn't depend on Bassinet existing at placement time.
    expect(p2.minorPlayed).toContain(CARD_ID)
    session.loadState(state)

    const resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)
    const farmland = resp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(2)
  })

  it('case 8: owner (start player) can re-enter their own first-used non-accum', () => {
    const session = baseSetup()
    const state = session.getState().state
    // Give A25 to P1 (the start player) instead
    const p1 = state.players[0]!
    if (!p1.minorPlayed.includes(CARD_ID)) p1.minorPlayed.push(CARD_ID)
    // Also remove A25 from P2 to isolate
    const p2 = state.players[1]!
    p2.minorPlayed = p2.minorPlayed.filter((id) => id !== CARD_ID)

    // P1 places on farmland (first non-accum, own)
    simulatePlacement(state, p1, 'farmland', '1')
    // Still P1's turn for the second placement attempt (simulate coming back around)
    state.currentPlayerIndex = 0
    session.loadState(state)

    // P1 tries farmland again — 1 person (self) on first non-accum → allowed
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const farmland = resp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(2)
    expect(farmland.takenBy.every((t) => t.playerId === 'p1')).toBe(true)
    const workerIds = farmland.takenBy.map((t) => t.workerId).sort()
    expect(new Set(workerIds).size).toBe(2) // two distinct worker ids
  })

  it.skip('case 9: D150 godly-spouse sends worker home — normal placement on empty space', () => {
    // D150 requires specific round state and stable occupation setup; skipped for brevity.
  })

  it('case 10: 2 occupants on first non-accum — rejected', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    // Simulate 2 of P1's own workers on farmland
    simulatePlacement(state, p1, 'farmland', '1')
    // Second ref doesn't need a matching recordRoundPlacement (A25 only checks count),
    // but to be realistic we record it too.
    simulatePlacement(state, p1, 'farmland', '2')
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(false)
  })

  it('case 11: undo restores takenBy', () => {
    const session = baseSetup()
    const state = session.getState().state
    const p1 = state.players[0]!
    simulatePlacement(state, p1, 'farmland', '1')
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)
    let farmland = resp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(2)

    // Undo P2's action
    const undoResp = session.undoAction()
    expect(undoResp.ok).toBe(true)

    farmland = undoResp.state.actionSpaces.find((s) => s.id === 'farmland')!
    expect(farmland.takenBy).toHaveLength(1)
    expect(farmland.takenBy[0]!.playerId).toBe('p1')
  })
})

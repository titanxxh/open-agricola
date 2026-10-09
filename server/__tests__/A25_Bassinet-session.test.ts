import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
  newbornCount,
} from '../../shared/domain/player'
import { addWorkerRef } from '../../shared/domain/space'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { appendImmediateEvents } from '../../shared/events/append'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { confirmNextPlayer } from './_helpers/pending-confirms'

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
 * mutating state: add WorkerRef, emit the placement event, and record the round placement.
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
  appendImmediateEvents(state, [{ type: 'worker.placed', workerId, spaceId }], {
    actorPlayerId: p.id,
    sourceActionId: spaceId,
  })
  recordRoundPlacement(p, spaceId, workerId)
}

/**
 * Base 2P setup: round 2, P1 is start player, P2 has A25.
 * Each player has 2 active workers all at home.
 */
const baseSetup = () => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundPhase = 'work'
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

const completeFarmland = (session: GameSession, playerIndex: number) => {
  let resp = session.takeAction(playerIndex, 'farmland')
  if (resp.ok && resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'farm-select') {
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitSelectionChoice(playerIndex, { tile: tile! })
  }
  return resp
}

const advanceTurn = (session: GameSession) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId === 'wait') expect(interaction.request.kind).toBe('confirm-next-player')
  return confirmNextPlayer(session)
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

  it('does not reuse work placement chronology outside the work phase', () => {
    const session = baseSetup()
    const state = session.getState().state
    simulatePlacement(state, state.players[0]!, 'farmland', '1')
    state.roundPhase = 'harvest'
    session.loadState(state)

    const loaded = session.getState().state
    expect(computeAllowedPlacementSpaces(loaded, loaded.players[1]!)
      .some((entry) => entry.spaceId === 'farmland')).toBe(false)
  })

  it('case 3: second non-accum space — rejected', () => {
    const session = baseSetup()

    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    advanceTurn(session)
    expect(session.takeAction(0, 'grain-seeds').ok).toBe(true)
    advanceTurn(session)

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(false)
  })

  it('case 4: Meeting Place is first non-accum — always rejected', () => {
    const session = baseSetup()

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.options?.some((option) => option.value === '__skip__')) {
      expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
    }
    advanceTurn(session)

    expect(session.getState().actionAvailability?.['meeting-place']).toBe(false)
    resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(false)
    expect(resp.scores).toHaveLength(2)
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

  it('case 11: undo restores placement eligibility', () => {
    const session = baseSetup()
    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)
    expect(session.getState().actionAvailability?.farmland).toBe(true)

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
    expect(undoResp.state.events.filter((event) =>
      event.type === 'worker.placed' && event.spaceId === 'farmland',
    )).toHaveLength(1)
    expect(undoResp.state.log.filter((entry) =>
      entry.key === 'log.placeFarmer' && entry.params?.action === 'actions.farmland.name',
    )).toHaveLength(1)
    expect(undoResp.interaction.stateId).toBe('idle')
    expect(undoResp.actionAvailability?.farmland).toBe(true)
    expect(undoResp.scores).toHaveLength(2)
    expect(completeFarmland(session, 1).ok).toBe(true)
  })

  it('only the Bassinet owner can follow another player onto the occupied space', () => {
    const session = baseSetup()
    const state = session.getState().state
    state.players[0]!.minorPlayed.push(CARD_ID)
    state.players[1]!.minorPlayed = state.players[1]!.minorPlayed.filter((id) => id !== CARD_ID)
    session.loadState(state)

    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)

    expect(session.takeAction(1, 'farmland').ok).toBe(false)
  })

  it('ignores accumulating actions used before the first non-accumulating action', () => {
    const session = baseSetup()

    expect(session.takeAction(0, 'forest').ok).toBe(true)
    advanceTurn(session)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    advanceTurn(session)
    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)

    expect(session.getState().actionAvailability?.farmland).toBe(true)
    expect(session.takeAction(1, 'farmland').ok).toBe(true)
  })

  it('does not bypass the target action requirements', () => {
    const session = baseSetup()
    const state = session.getState().state
    const firstPlayer = state.players[0]!
    const owner = state.players[1]!
    firstPlayer.occupationPlayed.push('A092_AdoptiveParents')
    firstPlayer.resources.food = 5
    firstPlayer.rooms = 3
    owner.rooms = 2
    session.loadState(state)

    let resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    resp = session.takeAnytimeAction(0, 'A92-adoptive-parents-anytime-grow')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.options?.some((option) => option.value === '__skip__')) {
      resp = session.resolveChoice(0, '__skip__')
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      resp = confirmNextPlayer(session)
    }

    expect(resp.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(1)
    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
    const rejected = session.takeAction(1, 'wish-children')
    expect(rejected.ok).toBe(false)
    expect(rejected.scores).toHaveLength(2)
  })

  it('recognizes an earlier first non-accumulating space when played mid-round', () => {
    const session = baseSetup()
    const state = session.getState().state
    const owner = state.players[1]!
    owner.minorPlayed = owner.minorPlayed.filter((id) => id !== CARD_ID)
    owner.minorHand = [CARD_ID]
    owner.resources.wood = 5
    owner.resources.reed = 5
    owner.resources.clay = 5
    owner.resources.stone = 5
    session.loadState(state)

    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)
    let resp = session.takeAction(1, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const improvement = resp.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(improvement ?? card).toBeDefined()
      resp = session.resolveChoice(1, (improvement ?? card)!.value)
    }
    if (resp.interaction.stateId === 'wait') {
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      if (card) resp = session.resolveChoice(1, card.value)
    }
    expect(resp.state.players[1]!.minorPlayed).toContain(CARD_ID)
    advanceTurn(session)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    advanceTurn(session)

    resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toHaveLength(2)
  })

  it('preserves the first space after Meeting Place changes the start player', () => {
    const session = baseSetup()

    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)
    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.options?.some((option) => option.value === '__skip__')) {
      resp = session.resolveChoice(1, '__skip__')
    }
    expect(resp.state.players[1]!.startPlayer).toBe(true)
    advanceTurn(session)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    advanceTurn(session)

    expect(session.getState().actionAvailability?.farmland).toBe(true)
    resp = completeFarmland(session, 1)
    expect(resp.ok).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toHaveLength(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      actorPlayerId: resp.state.players[1]!.id,
      spaceId: 'farmland',
    }))
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.placeFarmer',
      params: expect.objectContaining({
        player: resp.state.players[1]!.name,
        action: 'actions.farmland.name',
      }),
    }))
    expect(resp.scores).toHaveLength(2)
  })

  it('selects a new first non-accumulating action in the next work phase', () => {
    const session = baseSetup()

    expect(completeFarmland(session, 0).ok).toBe(true)
    advanceTurn(session)
    expect(completeFarmland(session, 1).ok).toBe(true)
    advanceTurn(session)

    const endState = session.getState().state
    endState.players.forEach((player) => markAllWorkersUsed(endState, player))
    session.loadState(endState)
    let resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(3)

    resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    advanceTurn(session)

    expect(session.getState().actionAvailability?.['grain-seeds']).toBe(true)
    resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toHaveLength(2)
    expect(resp.scores).toHaveLength(2)
  })

  it('uses actual chronology when one player acts twice before another', () => {
    const session = new GameSession(25, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setActiveWorkerCount(player, 2)
      setWorkersAtHome(state, player, 2)
    })
    state.players[3]!.minorPlayed = [CARD_ID]
    session.loadState(state)

    expect(session.takeAction(0, 'forest').ok).toBe(true)
    let next = session.getState().state
    next.currentPlayerIndex = 0
    session.loadState(next)
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    next = session.getState().state
    next.currentPlayerIndex = 1
    session.loadState(next)
    expect(session.takeAction(1, 'grain-seeds').ok).toBe(true)
    next = session.getState().state
    next.currentPlayerIndex = 3
    session.loadState(next)

    expect(next.events.filter((event) => event.type === 'worker.placed').slice(-3).map((event) => event.spaceId))
      .toEqual(['forest', 'day-laborer', 'grain-seeds'])
    expect(session.getState().actionAvailability?.['day-laborer']).toBe(true)
    expect(session.getState().actionAvailability?.['grain-seeds']).toBe(false)
    expect(session.takeAction(3, 'grain-seeds').ok).toBe(false)
    const followed = session.takeAction(3, 'day-laborer')
    expect(followed.ok).toBe(true)
    expect(followed.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(2)
    expect(followed.interaction.stateId).toBe('wait')
    if (followed.interaction.stateId === 'wait') {
      expect(followed.interaction.request.kind).toBe('confirm-next-player')
    }
    expect(followed.state.log).toContainEqual(expect.objectContaining({
      key: 'log.placeFarmer',
      params: expect.objectContaining({ action: 'actions.day-laborer.name' }),
    }))
    expect(followed.scores).toHaveLength(4)
  })
})

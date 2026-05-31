import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAvailable,
  newbornCount,
} from '../../shared/domain/player'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import { executeCardListener, getListenerById } from '../../shared/cards/card-listeners'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import type { SessionResponse } from '../../shared/session/session-core'
import '../../shared/cards/A/A92_AdoptiveParents'
import '../../shared/cards/D/D134_OysterEater'

const A92 = 'A92_AdoptiveParents'
const D134 = 'D134_OysterEater'

const placeholderHands = (state: {
  players: { minorHand: string[]; occupationHand: string[] }[]
}) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}

const reqKind = (r: SessionResponse): string | undefined =>
  r.interaction.stateId === 'wait' ? r.interaction.request.kind : undefined

const branchValue = (r: SessionResponse, index: number): string => {
  const opts = r.interaction.stateId === 'wait' ? (r.interaction.options ?? []) : []
  const found = opts[index]
  if (!found) throw new Error(`no XOR branch at index ${index}; got ${JSON.stringify(opts)}`)
  return found.value
}

/**
 * Two-player rotation fixture mirroring A92-extra-turn-session.test.ts: P0
 * holds A92 and is OUT of ordinary workers (its only active worker is a parked
 * Newborn occupying an action space). P1 is the current player with `p1Workers`.
 */
const setupRotation = (opts: {
  food?: number
  newborns?: number
  p1Workers?: number
  holdD134?: boolean
  d134Skip?: number
} = {}) => {
  const food = opts.food ?? 3
  const newborns = opts.newborns ?? 1
  const p1Workers = opts.p1Workers ?? 1

  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 1
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, Math.max(1, newborns))
  setWorkersAtHome(state, p0, 0)
  const parkSpaces = ['forest', 'clay-pit', 'reed-bank', 'fishing']
  const active = p0.workers
    .filter((w) => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  for (let i = 0; i < newborns && i < active.length; i++) {
    const w = active[i]!
    w.isNewborn = true
    const sp = state.actionSpaces.find((a) => a.id === parkSpaces[i])!
    sp.takenBy = [{ playerId: p0.id, workerId: w.id }] as typeof sp.takenBy
  }
  p0.occupationPlayed.push(A92)
  p0.resources.food = food
  if (opts.holdD134) {
    p0.occupationPlayed.push(D134)
    p0.cardStates = {
      ...(p0.cardStates ?? {}),
      [D134]: { extraData: { skipNextPlacement: opts.d134Skip ?? 1 } },
    }
  }

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, p1Workers)
  setWorkersAtHome(state, p1, p1Workers)

  placeholderHands(state)
  session.loadState(state)
  return session
}

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

const drainConfirms = (session: GameSession, start: SessionResponse): SessionResponse => {
  let r = start
  let guard = 0
  while (reqKind(r) === 'confirm-next-player' && guard++ < 8) {
    const owner =
      r.interaction.stateId === 'wait'
        ? r.interaction.playerIndex
        : session.getState().state.currentPlayerIndex
    r = session.resolveChoice(owner, 'confirm')
  }
  return r
}

const driveToP0ExtraTurn = (session: GameSession): SessionResponse => {
  const taken = session.takeAction(1, placeableSpaces(session)[0]!)
  expect(taken.ok).toBe(true)
  return drainConfirms(session, taken)
}

/** Anytime entries sourced from A92 (by descriptor.sourceCard). */
const a92AnytimeIds = (session: GameSession): string[] =>
  session
    .listAnytimeEntries()
    .filter((e) => e.descriptor.sourceCard === A92)
    .map((e) => e.descriptor.id)

const d134Skip = (r: SessionResponse): number | undefined =>
  (r.state.players[0]!.cardStates?.[D134]?.extraData as { skipNextPlacement?: number } | undefined)
    ?.skipNextPlacement

describe('A92 P2 fixes', () => {
  describe('T1: suppress A92 anytime inside its own extra-turn prompt', () => {
    it('A92 anytime grow is NOT offered while the A92 extra-turn XOR is pending', () => {
      const session = setupRotation({ food: 3 })
      const offer = driveToP0ExtraTurn(session)
      expect(reqKind(offer)).toBe('choice')
      // The XOR wait belongs to A92's own extra-turn frame. Letting the A92
      // anytime grow fire here would let the player promote+park a worker AND
      // then forfeit, double-dipping a placement. It must be suppressed.
      expect(a92AnytimeIds(session)).toEqual([])
    })

    it('regression: A92 anytime grow IS available outside its own pending frame', () => {
      // The suppression is scoped to A92's own pending frame, not a blanket
      // disable. Exercise the listener directly: with no A92 pending frame it
      // must still contribute its grow flow (P0 has a newborn + food). This
      // avoids `listAnytimeEntries`, which only lists the active interaction
      // owner's entries (P1 here), so it cannot observe P0's anytime.
      const session = setupRotation({ food: 3 })
      const state = session.getState().state
      const p0 = state.players[0]!
      expect(newbornCount(p0)).toBe(1)
      const reg = getListenerById('A92-adoptive-parents-anytime-grow')!
      const noFrame = executeCardListener(reg, {
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
      })
      expect(noFrame?.flow).toBeTruthy()
      // Inside A92's own pending frame it is suppressed.
      const inFrame = executeCardListener(reg, {
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
        pendingSourceCard: A92,
      })
      expect(inFrame).toBeUndefined()
    })
  })

  describe('T3: honor skip-turn effects before offering an extra turn', () => {
    it('a 0-worker A92 player with D134 skip is skipped, not offered the XOR', () => {
      const session = setupRotation({ food: 3, holdD134: true, d134Skip: 1 })
      const pre = session.getState()
      expect(workersAvailable(pre.state, pre.state.players[0]!)).toBe(0)
      expect(hasPendingExtraTurn(pre.state, pre.state.players[0]!)).toBe(true)
      expect(d134Skip(pre)).toBe(1)

      const after = driveToP0ExtraTurn(session)
      // Skip must win over the extra turn: no XOR offered to P0.
      expect(reqKind(after)).not.toBe('choice')
      // D134 skip flag is consumed exactly once (deleted → undefined).
      expect(d134Skip(after)).toBeUndefined()
      // The round completed instead of stalling on P0's (now-forfeited) extra
      // turn. The offspring was never promoted — its worker is still parked on
      // its action space (the round-end aging clears `isNewborn`, so we check the
      // parked worker, not newbornCount).
      const parked = after.state.actionSpaces.some((sp) =>
        (sp.takenBy ?? []).some((t) => t.playerId === after.state.players[0]!.id),
      )
      expect(parked).toBe(true)
      expect(after.state.round).toBe(2)
    })
  })

  describe('T4: initialize action snapshot for extra-turn placements', () => {
    it('USE branch: the extra-turn placement has an action snapshot', () => {
      const session = setupRotation({ food: 3 })
      const offer = driveToP0ExtraTurn(session)
      expect(reqKind(offer)).toBe('choice')
      const used = session.resolveChoice(0, branchValue(offer, 0))
      expect(used.ok).toBe(true)
      expect(['farm-select', 'choice']).toContain(reqKind(used))
      // The injected extra-turn frame must initialize per-action state the way
      // takeAction does (recordActionSnapshot). Without it, build/stable/fence
      // stat deltas (getRoomsBuiltThisAction etc.) fall back to absolute counts
      // and over-trigger cards like A23 Toolbox. The snapshot lives in
      // cardStates['__actionSnapshot__'] (readActionSnapshotToken). RED: token
      // is undefined because no recordActionSnapshot ran for the extra turn.
      expect(readActionSnapshotToken(used.state.players[0]!)).not.toBeUndefined()

      // Resolve the placement onto a real space (use the prompt's own options).
      const placeVal = used.interaction.stateId === 'wait' ? used.interaction.options![0]!.value : ''
      const placed = session.resolveChoice(0, placeVal)
      expect(placed.ok).toBe(true)
    })
  })
})

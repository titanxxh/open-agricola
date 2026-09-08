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
import type { ActionDefinition, ActionSpace } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../shared/actions/helpers/placement-constants'
import '../../shared/cards/A/A092_AdoptiveParents'
import '../../shared/cards/D/D134_OysterEater'

const A92 = 'A092_AdoptiveParents'
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
  const opts = r.interaction.stateId === 'wait' ? (r.interaction.request.options ?? []) : []
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

const addFailingActionSpace = (session: GameSession, id = '__test-failing-extra-turn-space__') => {
  const action: ActionDefinition = {
    id,
    nameKey: 'actions.forest.name',
    descriptionKey: 'actions.forest.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'fail', errorKey: 'log.action' }),
  }
  const testSession = session as unknown as {
    registry: { register(action: ActionDefinition): void }
  }
  testSession.registry.register(action)
  session.getState().state.actionSpaces.push({
    ...action,
    resources: {},
    takenBy: [],
  } satisfies ActionSpace)
  return id
}

const addAutoResolveFailingActionSpace = (
  session: GameSession,
  id = '__test-auto-resolve-failing-extra-turn-space__',
) => {
  const action: ActionDefinition = {
    id,
    nameKey: 'actions.forest.name',
    descriptionKey: 'actions.forest.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({
      type: 'request',
      request: {
        kind: 'choice',
        options: [{ value: 'auto-fail', labelKey: 'ui.interactionConfirm' }],
      },
    }),
    resolveChoice: () => ({ type: 'fail', errorKey: 'log.action' }),
  }
  const testSession = session as unknown as {
    registry: { register(action: ActionDefinition): void }
  }
  testSession.registry.register(action)
  session.getState().state.actionSpaces.push({
    ...action,
    resources: {},
    takenBy: [],
  } satisfies ActionSpace)
  return id
}

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

    it('regression: A92 anytime grow IS available outside its own pending frame when a worker can still act', () => {
      // The suppression is scoped to A92's own pending frame, not a blanket
      // disable. Exercise the listener directly: with no A92 pending frame and
      // an ordinary worker still available, it must still contribute its grow
      // flow.
      const session = setupRotation({ food: 3 })
      const state = session.getState().state
      const p0 = state.players[0]!
      setActiveWorkerCount(p0, 2)
      p0.workers.find((worker) => worker.id === '2')!.isNewborn = false
      expect(workersAvailable(state, p0)).toBe(1)
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

    it('A92 anytime grow is NOT available when the player has no ordinary worker left', () => {
      const session = setupRotation({ food: 3 })
      const state = session.getState().state
      const p0 = state.players[0]!
      expect(workersAvailable(state, p0)).toBe(0)
      expect(newbornCount(p0)).toBe(1)
      const reg = getListenerById('A92-adoptive-parents-anytime-grow')!

      const result = executeCardListener(reg, {
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
      })

      expect(result).toBeUndefined()
    })
  })

  describe('T3: honor skip-turn effects before offering an extra turn', () => {
    it('a 0-worker A92 player with D134 skip is skipped, not offered the XOR', () => {
      const session = setupRotation({ food: 3, holdD134: true, d134Skip: 1 })
      const pre = session.getState()
      expect(workersAvailable(pre.state, pre.state.players[0]!)).toBe(0)
      expect(hasPendingExtraTurn(pre.state, pre.state.players[0]!)).toBe(true)
      expect(d134Skip(pre)).toBe(1)

      // P1 places on a fixed non-`fishing` space: D134 OysterEater's
      // scope:'any' after-fishing listener would otherwise bump P0's
      // skipNextPlacement 1→2, masking the "consumed exactly once" assertion.
      const p1Space = placeableSpaces(session).find((id) => id !== 'fishing')!
      const taken = session.takeAction(1, p1Space)
      expect(taken.ok).toBe(true)
      const after = drainConfirms(session, taken)

      // Skip must win over the extra turn: P0 is never offered the XOR. If the
      // T3 gate regressed, the rotation would inject P0's extra-turn XOR here
      // (reqKind === 'choice') instead of skipping past them.
      expect(reqKind(after)).not.toBe('choice')
      // P0 went through the skip path, not the extra-turn path.
      expect(
        after.state.events.some(
          (e) => e.type === 'turn.skipped' && e.playerId === after.state.players[0]!.id,
        ),
      ).toBe(true)
      // D134 skip flag is consumed exactly once (deleted → undefined).
      expect(d134Skip(after)).toBeUndefined()
      // Round advanced instead of stalling on P0's (now-forfeited) extra turn.
      expect(after.state.round).toBe(2)
    })

    it('D134 skip keeps suppressing the skipped A92 extra turn after rotating to another player', () => {
      const session = setupRotation({ food: 3, holdD134: true, d134Skip: 1, p1Workers: 2 })
      const firstSpace = placeableSpaces(session).find((id) => id !== 'fishing')!
      const first = session.takeAction(1, firstSpace)
      expect(first.ok).toBe(true)
      const afterSkip = drainConfirms(session, first)

      expect(reqKind(afterSkip)).not.toBe('choice')
      expect(afterSkip.state.currentPlayerIndex).toBe(1)
      expect(d134Skip(afterSkip)).toBeUndefined()

      const secondSpace = placeableSpaces(session).find((id) => id !== 'fishing')!
      const second = session.takeAction(1, secondSpace)
      expect(second.ok).toBe(true)
      const afterSecond = drainConfirms(session, second)

      expect(reqKind(afterSecond)).not.toBe('choice')
      expect(afterSecond.state.round).toBe(2)
    })

    it('D134 skip consumes only one A92 extra-turn opportunity when multiple newborns remain', () => {
      const session = setupRotation({ food: 3, newborns: 2, holdD134: true, d134Skip: 1 })
      const p1Space = placeableSpaces(session).find((id) => id !== 'fishing')!
      const taken = session.takeAction(1, p1Space)
      expect(taken.ok).toBe(true)
      const afterSkip = drainConfirms(session, taken)

      expect(reqKind(afterSkip)).toBe('choice')
      expect(d134Skip(afterSkip)).toBeUndefined()
      expect(newbornCount(afterSkip.state.players[0]!)).toBe(2)

      const used = session.resolveChoice(0, branchValue(afterSkip, 0))
      expect(used.ok).toBe(true)
      expect(['farm-select', 'choice']).toContain(reqKind(used))
    })

    it('stacked D134 skips consume stacked A92 extra-turn opportunities before offering XOR', () => {
      const session = setupRotation({ food: 3, newborns: 2, holdD134: true, d134Skip: 2 })
      const p1Space = placeableSpaces(session).find((id) => id !== 'fishing')!
      const taken = session.takeAction(1, p1Space)
      expect(taken.ok).toBe(true)
      const afterSkips = drainConfirms(session, taken)

      expect(reqKind(afterSkips)).not.toBe('choice')
      expect(d134Skip(afterSkips)).toBeUndefined()
      expect(afterSkips.state.round).toBe(2)
    })

    it('stacked D134 skips can consume more A92 opportunities than player count', () => {
      const session = setupRotation({ food: 3, newborns: 3, holdD134: true, d134Skip: 3 })
      const p1Space = placeableSpaces(session).find((id) => id !== 'fishing')!
      const taken = session.takeAction(1, p1Space)
      expect(taken.ok).toBe(true)
      const afterSkips = drainConfirms(session, taken)

      expect(reqKind(afterSkips)).not.toBe('choice')
      expect(d134Skip(afterSkips)).toBeUndefined()
      expect(afterSkips.state.round).toBe(2)
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
      const placeVal = used.interaction.stateId === 'wait' ? used.interaction.request.options![0]!.value : ''
      const placed = session.resolveChoice(0, placeVal)
      expect(placed.ok).toBe(true)
    })
  })

  describe('T2: blocked extra-turn target actions and explicit undo', () => {
    it('undoStep removes the promoted worker after a failed target', () => {
      const session = setupRotation({ food: 3, newborns: 2 })
      const failingSpaceId = addFailingActionSpace(session)

      const offer = driveToP0ExtraTurn(session)
      expect(reqKind(offer)).toBe('choice')
      const used = session.resolveChoice(0, branchValue(offer, 0))
      expect(used.ok).toBe(true)
      expect(['farm-select', 'choice']).toContain(reqKind(used))

      const failed = session.resolveChoice(0, failingSpaceId)
      expect(failed.ok).toBe(true)
      expect(failed.interaction.request.kind).toBe('engine-blocked')
      expect(session.undoStep(0).ok).toBe(true)
      const p0 = session.getState().state.players[0]!
      const failingSpace = session.getState().state.actionSpaces.find((space) => space.id === failingSpaceId)!
      expect(failingSpace.takenBy.filter((ref) => ref.playerId === p0.id)).toHaveLength(0)
      expect(readActionSnapshotToken(p0)).toBeDefined()
    })

    it('undoStep removes only the newly placed worker after an occupied target fails', () => {
      const session = setupRotation({ food: 3, newborns: 2 })
      const failingSpaceId = addFailingActionSpace(session)
      const state = session.getState().state
      const p0 = state.players[0]!
      const oldWorker = p0.workers.find((w) => w.id === '1')!
      const promotedWorker = p0.workers.find((w) => w.id === '2')!
      oldWorker.isNewborn = false
      state.actionSpaces.forEach((space) => {
        space.takenBy = space.takenBy.filter(
          (ref) => !(ref.playerId === p0.id && ref.workerId === oldWorker.id),
        )
      })
      const failingSpace = state.actionSpaces.find((space) => space.id === failingSpaceId)!
      failingSpace.takenBy = [{ playerId: p0.id, workerId: oldWorker.id }]
      session.loadState(state)

      registerActionHook({
        id: 'test-a92-allow-occupied-failing-space',
        actions: ['place-farmer'],
        phases: ['computeArgs'],
        handler: () => ({
          extraOptions: [{
            value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${failingSpaceId}`,
            labelKey: 'actions.forest.name',
          }],
        }),
      })
      try {
        const offer = driveToP0ExtraTurn(session)
        const used = session.resolveChoice(0, branchValue(offer, 0))
        expect(used.ok).toBe(true)
        expect(used.interaction.stateId).toBe('wait')
        expect(used.interaction.request.options?.map((option) => option.value)).toContain(
          `${OCCUPIED_SPACE_CHOICE_PREFIX}${failingSpaceId}`,
        )

        const failed = session.resolveChoice(0, `${OCCUPIED_SPACE_CHOICE_PREFIX}${failingSpaceId}`)
        expect(failed.ok).toBe(true)
      expect(failed.interaction.request.kind).toBe('engine-blocked')
      expect(session.undoStep(0).ok).toBe(true)

        const after = session.getState().state.actionSpaces.find((space) => space.id === failingSpaceId)!
        expect(after.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }])
        expect(after.takenBy).not.toEqual(
          expect.arrayContaining([{ playerId: p0.id, workerId: promotedWorker.id }]),
        )
      } finally {
        unregisterActionHook('test-a92-allow-occupied-failing-space')
      }
    })

    it('undoStep removes the promoted worker after an auto-resolved target fails', () => {
      const session = setupRotation({ food: 3, newborns: 2 })
      const failingSpaceId = addAutoResolveFailingActionSpace(session)

      const offer = driveToP0ExtraTurn(session)
      const used = session.resolveChoice(0, branchValue(offer, 0))
      expect(used.ok).toBe(true)
      expect(['farm-select', 'choice']).toContain(reqKind(used))

      const failed = session.resolveChoice(0, failingSpaceId)
      expect(failed.ok).toBe(true)
      expect(failed.interaction.request.kind).toBe('engine-blocked')
      expect(session.undoStep(0).ok).toBe(true)

      const p0 = session.getState().state.players[0]!
      const failingSpace = session.getState().state.actionSpaces.find((space) => space.id === failingSpaceId)!
      expect(failingSpace.takenBy.filter((ref) => ref.playerId === p0.id)).toHaveLength(0)
    })

    it('pending-context rollback removes the placed worker id when active context is unavailable', () => {
      const session = setupRotation({ food: 3, newborns: 2 })
      const failingSpaceId = addFailingActionSpace(session)
      const state = session.getState().state
      const p0 = state.players[0]!
      const oldWorker = p0.workers.find((w) => w.id === '1')!
      const promotedWorker = p0.workers.find((w) => w.id === '2')!
      oldWorker.isNewborn = false
      state.actionSpaces.forEach((space) => {
        space.takenBy = space.takenBy.filter(
          (ref) => !(ref.playerId === p0.id && ref.workerId === oldWorker.id),
        )
      })
      const failingSpace = state.actionSpaces.find((space) => space.id === failingSpaceId)!
      failingSpace.takenBy = [
        { playerId: p0.id, workerId: oldWorker.id },
        { playerId: p0.id, workerId: promotedWorker.id },
      ]
      session.pushSyntheticPendingFrame({
        hostNodeId: '__test-pending-context__',
        request: {
          kind: 'choice',
          options: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
        },
        choices: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
        ownerNodeId: null,
        contextSnapshot: {
          actionContext: {
            targetSpaceId: failingSpaceId,
            placedWorkerId: promotedWorker.id,
          },
        },
        effectiveOwnerPlayerId: p0.id,
      }, 0, 'top-level')
      ;(session as unknown as {
        cleanupFailedWorkerPlacement(space: ActionSpace, player: typeof p0): void
      }).cleanupFailedWorkerPlacement(state.actionSpaces[0]!, p0)

      expect(failingSpace.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }])
      expect(failingSpace.takenBy).not.toEqual(
        expect.arrayContaining([{ playerId: p0.id, workerId: promotedWorker.id }]),
      )
    })
  })

  describe('forfeit log', () => {
    it('forfeiting A92 writes a visible declined card log entry', () => {
      const session = setupRotation()
      const offer = driveToP0ExtraTurn(session)

      const forfeited = session.resolveChoice(0, branchValue(offer, 1))
      expect(forfeited.ok).toBe(true)

      const log = session.getState().state.log
      expect(log).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'log.cardTriggered',
            params: expect.objectContaining({
              cardId: A92,
              declined: true,
              optional: true,
            }),
          }),
        ]),
      )
      expect(log).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'log.cardTriggered',
            params: expect.objectContaining({
              cardId: A92,
              triggerAction: 'actions.special-effect.name',
            }),
          }),
        ]),
      )
    })

    it('forfeitedThisRound clears through the real next-round start path', () => {
      const session = setupRotation()
      const offer = driveToP0ExtraTurn(session)
      const forfeited = session.resolveChoice(0, branchValue(offer, 1))
      expect(forfeited.ok).toBe(true)
      expect(forfeited.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(true)

      const nextRound = drainConfirms(session, forfeited)
      expect(nextRound.state.round).toBe(2)
      expect(nextRound.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(false)
    })
  })
})

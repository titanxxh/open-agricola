import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { emptyResources } from '../../shared/contract/state-constants'
import { getChoiceOptions } from './_helpers/session-assertions'
import { expectWait } from './_helpers/trigger-select'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { createWorkSession } from './_helpers/session-fixtures'
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
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../shared/actions/helpers/placement-constants'
import '../../shared/cards/A/A092_AdoptiveParents'
import '../../shared/cards/D/D134_OysterEater'
const sessionEvidence = createScenarioEvidence(import.meta.url)
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
  const opts = r.interaction.stateId === 'wait' ? (getChoiceOptions(r)) : []
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
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
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
    sp.takenBy = [{ playerId: p0.id, workerId: w.id }]
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
  session.withCtx(() => session
    .listAnytimeEntries())
    .filter((e) => e.descriptor.sourceCard === A92)
    .map((e) => e.descriptor.id)
const d134Skip = (r: SessionResponse): number | undefined => {
  const value = r.state.players[0]!.cardStates[D134]?.extraData?.skipNextPlacement
  return typeof value === 'number' ? value : undefined
}
const failureCalls = new WeakMap<GameSession, Map<string, {
  executed: number
  resolved: number
}>>()
const beginFailure = (session: GameSession, id: string) => {
  const calls = { executed: 0, resolved: 0 }
  const byId = failureCalls.get(session) ?? new Map<string, {
    executed: number
    resolved: number
  }>()
  byId.set(id, calls)
  failureCalls.set(session, byId)
  return calls
}
const assertPlacedBeforeFailure = (state: SessionResponse['state'], playerId: string, id: string, placedWorkerId: unknown) => {
  expect(typeof placedWorkerId).toBe('string')
  const target = state.actionSpaces.find(space => space.id === id)
  expect(target?.takenBy).toContainEqual({ playerId, workerId: placedWorkerId })
  sessionEvidence.record('failure body with placed worker', { id, placedWorkerId, occupants: target?.takenBy })
}
const addFailingActionSpace = (session: GameSession, id = '__test-failing-extra-turn-space__') => {
  const calls = beginFailure(session, id)
  const action: ActionDefinition = {
    id,
    nameKey: 'actions.forest.name',
    descriptionKey: 'actions.forest.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: ({ state, player, actionContext }) => {
      calls.executed++
      assertPlacedBeforeFailure(state, player.id, id, actionContext?.placedWorkerId)
      return { type: 'fail', errorKey: 'log.action' }
    },
  }
  session.getState().state.actionSpaces.push({
    ...action,
    resources: { ...emptyResources },
    takenBy: [],
  } satisfies ActionSpace)
  return id
}
const addAutoResolveFailingActionSpace = (session: GameSession, id = '__test-auto-resolve-failing-extra-turn-space__', explicit = false) => {
  const calls = beginFailure(session, id)
  const action: ActionDefinition = {
    id,
    nameKey: 'actions.forest.name',
    descriptionKey: 'actions.forest.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: ({ state, player, actionContext }) => {
      calls.executed++
      assertPlacedBeforeFailure(state, player.id, id, actionContext?.placedWorkerId)
      return {
        type: 'request',
        request: {
          kind: 'choice',
          requiresExplicitChoice: explicit,
          options: [{ value: 'auto-fail', labelKey: 'ui.interactionConfirm' }],
        },
      }
    },
    resolveChoice: ({ state, player, actionContext }) => {
      calls.resolved++
      assertPlacedBeforeFailure(state, player.id, id, actionContext?.placedWorkerId)
      return { type: 'fail', errorKey: 'log.action' }
    },
  }
  session.getState().state.actionSpaces.push({
    ...action,
    resources: { ...emptyResources },
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
      const reg = session.withCtx(() => getListenerById('A92-adoptive-parents-anytime-grow'))!
      const noFrame = session.withCtx(() => executeCardListener(reg, {
        actionHooks: session.actionHooks,
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
      }))
      expect(noFrame?.flow).toBeTruthy()
      // Inside A92's own pending frame it is suppressed.
      const inFrame = session.withCtx(() => executeCardListener(reg, {
        actionHooks: session.actionHooks,
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
        pendingSourceCard: A92,
      }))
      expect(inFrame).toBeUndefined()
    })
    it('A92 anytime grow is NOT available when the player has no ordinary worker left', () => {
      const session = setupRotation({ food: 3 })
      const state = session.getState().state
      const p0 = state.players[0]!
      expect(workersAvailable(state, p0)).toBe(0)
      expect(newbornCount(p0)).toBe(1)
      const reg = session.withCtx(() => getListenerById('A92-adoptive-parents-anytime-grow'))!
      const result = session.withCtx(() => executeCardListener(reg, {
        actionHooks: session.actionHooks,
        state,
        player: p0,
        space: state.actionSpaces[0]!,
        actionId: 'anytime',
        phase: 'anytime',
      }))
      expect(result).toBeUndefined()
    })
  })
  describe('T3: honor skip-turn effects before offering an extra turn', () => {
    it('a 0-worker A92 player with D134 skip is skipped, not offered the XOR', () => {
      const session = setupRotation({ food: 3, holdD134: true, d134Skip: 1 })
      const pre = session.getState()
      expect(workersAvailable(pre.state, pre.state.players[0]!)).toBe(0)
      expect(session.withCtx(() => hasPendingExtraTurn(pre.state, pre.state.players[0]!))).toBe(true)
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
      // The next preparation window clears the consumed skip to zero.
      expect(d134Skip(after)).toBe(0)
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
      expect(d134Skip(afterSkips)).toBe(0)
      expect(afterSkips.state.round).toBe(2)
    })

    it('stacked D134 skips can consume more A92 opportunities than player count', () => {
      const session = setupRotation({ food: 3, newborns: 3, holdD134: true, d134Skip: 3 })
      const p1Space = placeableSpaces(session).find((id) => id !== 'fishing')!
      const taken = session.takeAction(1, p1Space)
      expect(taken.ok).toBe(true)
      const afterSkips = drainConfirms(session, taken)

      expect(reqKind(afterSkips)).not.toBe('choice')
      expect(d134Skip(afterSkips)).toBe(0)
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
      const placeVal = used.interaction.stateId === 'wait' ? getChoiceOptions(used)[0]!.value : ''
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
      expect(failureCalls.get(session)?.get(failingSpaceId)?.executed).toBe(1)
      expect(expectWait(failed).interaction.request.kind).toBe('engine-blocked')
      expect(session.undoStep().ok).toBe(true)
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
      session.actionHooks.register({
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
        expect(getChoiceOptions(used).map((option) => option.value)).toContain(`${OCCUPIED_SPACE_CHOICE_PREFIX}${failingSpaceId}`)
        const failed = session.resolveChoice(0, `${OCCUPIED_SPACE_CHOICE_PREFIX}${failingSpaceId}`)
        expect(failed.ok).toBe(true)
        expect(expectWait(failed).interaction.request.kind).toBe('engine-blocked')
        expect(session.undoStep().ok).toBe(true)
        const after = session.getState().state.actionSpaces.find((space) => space.id === failingSpaceId)!
        expect(after.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }])
        expect(after.takenBy).not.toEqual(
          expect.arrayContaining([{ playerId: p0.id, workerId: promotedWorker.id }]),
        )
      }
      finally {
        session.actionHooks.unregister('test-a92-allow-occupied-failing-space')
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
      expect(expectWait(failed).interaction.request.kind).toBe('engine-blocked')
      expect(session.undoStep().ok).toBe(true)
      const p0 = session.getState().state.players[0]!
      const failingSpace = session.getState().state.actionSpaces.find((space) => space.id === failingSpaceId)!
      expect(failingSpace.takenBy.filter((ref) => ref.playerId === p0.id)).toHaveLength(0)
    })
    it('restored failed target preserves the parked worker and undo permits a legal retry', () => {
      const session = setupRotation({ food: 3, newborns: 2 })
      const failingSpaceId = addAutoResolveFailingActionSpace(session, '__test-restored-failing-extra-turn-space__', true)
      const state = session.getState().state
      const p0 = state.players[0]!
      const oldWorker = p0.workers.find(worker => worker.id === '1')!
      const promotedWorker = p0.workers.find(worker => worker.id === '2')!
      oldWorker.isNewborn = false
      for (const space of state.actionSpaces)
        space.takenBy = space.takenBy.filter(ref => !(ref.playerId === p0.id && ref.workerId === oldWorker.id))
      const target = state.actionSpaces.find(space => space.id === failingSpaceId)!
      target.takenBy = [{ playerId: p0.id, workerId: oldWorker.id }]
      session.loadState(state)
      session.actionHooks.register({
        id: 'test-a92-restore-occupied-target', actions: ['place-farmer'], phases: ['computeArgs'],
        handler: () => ({ extraOptions: [{ value: OCCUPIED_SPACE_CHOICE_PREFIX + failingSpaceId, labelKey: 'actions.forest.name' }] }),
      })
      const offer = driveToP0ExtraTurn(session)
      const promoted = session.resolveChoice(0, branchValue(offer, 0))
      expect(promoted.ok, promoted.error).toBe(true)
      expect(getChoiceOptions(promoted).map(option => option.value)).toContain(OCCUPIED_SPACE_CHOICE_PREFIX + failingSpaceId)
      const pending = session.resolveChoice(0, OCCUPIED_SPACE_CHOICE_PREFIX + failingSpaceId)
      expect(pending.ok, pending.error).toBe(true)
      expect(getChoiceOptions(pending).map(option => option.value)).toEqual(['auto-fail'])
      expect(session.state.actionSpaces.find(space => space.id === failingSpaceId)!.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }, { playerId: p0.id, workerId: promotedWorker.id }])
      expect(failureCalls.get(session)?.get(failingSpaceId)).toEqual({ executed: 1, resolved: 0 })
      const recovered = rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))
      const restoredTarget = recovered.state.actionSpaces.find(space => space.id === failingSpaceId)!
      // Dynamic fixture callbacks are code, so restore them alongside the serialized public cursor.
      restoredTarget.canBeExecutedByPlayer = target.canBeExecutedByPlayer
      restoredTarget.execute = target.execute
      restoredTarget.resolveChoice = target.resolveChoice
      const restored = sessionEvidence.track(new GameSession(recovered))
      expect(getChoiceOptions(restored.getState()).map(option => option.value)).toEqual(['auto-fail'])
      sessionEvidence.record('restored driver context', restored.peekEngine()?.peekNextDriverStep())
      sessionEvidence.record('restored pending envelope', restored.peekEnginePendingEnvelope())
      const failed = restored.resolveChoice(0, 'auto-fail')
      expect(failed.ok).toBe(false)
      expect(failed.error).toBe('log.action')
      expect(failed.interaction.stateId).toBe('wait')
      if (failed.interaction.stateId !== 'wait')
        throw new Error('expected blocked interaction')
      expect(failed.interaction.request.kind).toBe('engine-blocked')
      expect(failureCalls.get(session)?.get(failingSpaceId)).toEqual({ executed: 1, resolved: 1 })
      expect(restoredTarget.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }, { playerId: p0.id, workerId: promotedWorker.id }])
      const undone = restored.undoStep()
      expect(undone.ok, undone.error).toBe(true)
      expect(getChoiceOptions(undone).map(option => option.value)).toEqual(['auto-fail'])
      expect(undone.state.actionSpaces.find(space => space.id === failingSpaceId)!.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }, { playerId: p0.id, workerId: promotedWorker.id }])
      const undoPlacement = restored.undoStep()
      expect(undoPlacement.ok, undoPlacement.error).toBe(true)
      const after = undoPlacement.state.actionSpaces.find(space => space.id === failingSpaceId)!
      expect(after.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }])
      const retried = restored.resolveChoice(0, 'grain-seeds')
      expect(retried.ok, retried.error).toBe(true)
      expect(retried.state.players[0]!.resources.grain).toBe(1)
      expect(retried.state.actionSpaces.find(space => space.id === failingSpaceId)!.takenBy).toEqual([{ playerId: p0.id, workerId: oldWorker.id }])
      expect(retried.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toEqual([{ playerId: p0.id, workerId: promotedWorker.id }])
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

import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { stabilizeRandomHands } from '../../../server/__tests__/_helpers/stabilize-random-hands.ts'
import { captureStateWithHistory } from '../history-streams.ts'
import { snapshotForWorker } from '../recovery-catalog.ts'
import { rehydrateState, serializeSessionSnapshot, serializeState } from '../serialization.ts'

const createSession = (variants = false) => {
  const session = new GameSession(587, undefined, {
    playerCount: 2,
    ...(variants ? {
      enableParentCards: true,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    } : {}),
  })
  stabilizeRandomHands(session.state.players)
  return session
}

describe('shared snapshot core capture', () => {
  it.each([false, true])('preserves the original values and key order with variants=%s', variants => {
    const session = createSession(variants)
    try {
      const expected = {
        state: captureStateWithHistory(session.state),
        frame: session.withCtx(() => captureStateWithHistory(serializeState(session.state, {}))),
        sessionCursor: session.createSessionPrivateCursor(),
      }
      const snapshot = serializeSessionSnapshot(session.state, session)

      expect(JSON.stringify(snapshot)).toBe(JSON.stringify(expected))
      expect(snapshot.frame.roundStartSnapshot).toBeNull()
      expect(snapshot.frame.engineStack).toEqual({ frames: [] })
      expect(snapshot.state.actionSpaces.some(space => Object.hasOwn(space, 'flow'))).toBe(true)
      expect(snapshot.frame.actionSpaces.every(space => !Object.hasOwn(space, 'flow'))).toBe(true)
      expect(snapshot.frame.players[0]!.resources).toBe(snapshot.state.players[0]!.resources)
      expect(snapshot.frame.players[0]!.cardStates).toBe(snapshot.state.players[0]!.cardStates)
      expect(snapshot.frame.actionSpaces[0]!.resources).toBe(snapshot.state.actionSpaces[0]!.resources)
      expect(snapshot.state.players[0]!.resources).not.toBe(session.state.players[0]!.resources)
      expect(() => { snapshot.state.players[0]!.resources.food = 999 }).toThrow(TypeError)

      const capturedFrame = JSON.stringify(snapshot.frame)
      session.updatePlayerName(0, 'New live name')
      session.state.players[0]!.resources.food = 123
      session.state.players[0]!.minorHand.push('__later_card__')
      expect(JSON.stringify(snapshot.frame)).toBe(capturedFrame)
    } finally {
      session.dispose()
    }
  })

  it.each(['native', 'worker', 'frame'] as const)('restores writable %s state without changing either saved view', source => {
    const original = createSession()
    const snapshot = serializeSessionSnapshot(original.state, original)
    const saved = source === 'worker'
      ? structuredClone(snapshotForWorker(snapshot))
      : snapshot
    const beforeState = JSON.stringify(saved.state)
    const beforeFrame = JSON.stringify(saved.frame)
    const restored = new GameSession(rehydrateState(source === 'frame' ? saved.frame : saved))
    try {
      const player = restored.state.players[0]!
      player.resources.food = 17
      player.minorHand.push('__restored_card__')
      player.cardStates.A075_LumberMill = { counters: { used: 1 } }
      restored.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 8

      const response = restored.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBeGreaterThanOrEqual(8)
      expect(JSON.stringify(saved.state)).toBe(beforeState)
      expect(JSON.stringify(saved.frame)).toBe(beforeFrame)
      expect(saved.frame.players[0]!.resources).toBe(saved.state.players[0]!.resources)
      expect(restored.state.players[0]!.minorHand).not.toBe(saved.state.players[0]!.minorHand)
      expect(restored.state.players[0]!.cardStates).not.toBe(saved.state.players[0]!.cardStates)
    } finally {
      restored.dispose()
      original.dispose()
    }
  })

  it('keeps Frame presentation replacements independent of the shared authority core', () => {
    const session = createSession()
    try {
      const snapshot = serializeSessionSnapshot(session.state, session)
      const beforeState = JSON.stringify(snapshot.state)
      snapshot.frame.players[0]!.name = 'Archived name'
      snapshot.frame.players[0]!.pastureCapacities = { worker: 7 }
      snapshot.frame.log = [{ key: 'frameOnlyCapture', playerId: 'p1', params: { player: 'Archived name' } }]

      expect(JSON.stringify(snapshot.state)).toBe(beforeState)
      expect(snapshot.frame.players[0]!.pastureCapacities).toEqual({ worker: 7 })
    } finally {
      session.dispose()
    }
  })
})

/**
 * Behavioral tests for the state.pendingUndoBoundary one-shot flag in pushHistory.
 *
 * The flag is set by card code (e.g. after rolling random) to mark the next
 * history snapshot as an undo boundary that cannot be stepped past.
 *
 * Strategy:
 *  1. Inject `state.pendingUndoBoundary = true` via `(session as any)` after session
 *     construction but before an action that calls pushHistory.
 *  2. Drive pushHistory indirectly by calling `session.takeAction(...)`.
 *  3. Assert that:
 *     a) The flag is cleared on state after the action completes.
 *     b) The most recent history entry carries undoBoundary: true.
 *  4. Assert that undoStep() is blocked (returns ok:false) because the last
 *     history entry is an undo boundary.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../game-session'

describe('state.pendingUndoBoundary consumed by pushHistory', () => {
  let session: GameSession

  beforeEach(() => {
    session = new GameSession()
  })

  it('flag is cleared and history entry gets undoBoundary:true', () => {
    // Inject the one-shot flag before calling an action.
    ;(session as any).state.pendingUndoBoundary = true

    // Take an action — this calls pushHistory internally.
    const result = session.takeAction(0, 'forest')
    expect(result.ok).toBe(true)

    // The flag must be cleared from live state.
    expect((session as any).state.pendingUndoBoundary).toBeFalsy()

    // The most recent history entry must carry undoBoundary: true.
    const history: { undoBoundary?: boolean }[] = (session as any).history
    expect(history.length).toBeGreaterThan(0)
    const lastEntry = history[history.length - 1]
    expect(lastEntry?.undoBoundary).toBe(true)
  })

  it('persisted history entry does NOT carry a lingering pendingUndoBoundary', () => {
    ;(session as any).state.pendingUndoBoundary = true

    session.takeAction(0, 'forest')

    // The snapshot inside the history entry should not have pendingUndoBoundary=true
    // (it must have been cleared BEFORE cloneState was called).
    const history: { state: { pendingUndoBoundary?: boolean } }[] = (session as any).history
    const lastEntry = history[history.length - 1]
    expect(lastEntry?.state?.pendingUndoBoundary).toBeFalsy()
  })

  it('undoStep is blocked when the last history entry is an undo boundary', () => {
    ;(session as any).state.pendingUndoBoundary = true

    session.takeAction(0, 'forest')

    // undoStep must refuse to cross the boundary entry.
    const undoResult = session.undoStep()
    expect(undoResult.ok).toBe(false)
    expect(undoResult.error).toBe('cannot undo past boundary')
  })

  it('without the flag, undoStep succeeds normally', () => {
    // Control test: without pendingUndoBoundary the undo should work.
    session.takeAction(0, 'forest')

    const undoResult = session.undoStep()
    expect(undoResult.ok).toBe(true)
  })

  it('flag is one-shot: only the first pushHistory call gets undoBoundary:true', () => {
    ;(session as any).state.pendingUndoBoundary = true

    // First action consumes the flag.
    session.takeAction(0, 'forest')

    const history: { undoBoundary?: boolean }[] = (session as any).history
    const entryCountAfterFirst = history.length
    expect(history[entryCountAfterFirst - 1]?.undoBoundary).toBe(true)

    // Undo that action to get back to a state where we can take another action.
    // (Undo won't work because it's a boundary — we need to take an action for p1.)
    // Instead confirm next player and let p2 take an action; the flag must NOT be set.
    session.confirmNextPlayer()

    session.takeAction(1, 'clay-pit')

    const historyAfterSecond: { undoBoundary?: boolean }[] = (session as any).history
    const lastEntry = historyAfterSecond[historyAfterSecond.length - 1]
    // This new entry was NOT preceded by pendingUndoBoundary, so it must be falsy.
    expect(lastEntry?.undoBoundary).toBeFalsy()
  })
})

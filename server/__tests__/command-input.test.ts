import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import { expect, it } from 'vitest'
import { createOpeningSession } from './_helpers/session-fixtures'
import { assertCommandInput, nextInputWindow } from '../game/command-input'

it('retains both players input window while their draft submissions advance committed versions', () => {
  const session = createOpeningSession({ seed: 42,
    options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7 },
    expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  const initial = nextInputWindow(null, session.state, 'initial')!
  expect(initial.kind).toBe('draft')
  const first = session.state.players[0]!.id
  const second = session.state.players[1]!.id
  expect(session.submitDraftPick(first, firstDraftPick(session.state.draft!, first)).ok).toBe(true)
  const afterFirst = nextInputWindow(initial, session.state, 'draftSubmit')!
  expect(afterFirst.id).toBe(initial.id)
  expect(() => assertCommandInput('draftSubmit', { expectedVersion: 0, inputWindowId: initial.id }, 1, afterFirst)).not.toThrow()
  expect(session.submitDraftPick(second, firstDraftPick(session.state.draft!, second)).ok).toBe(true)
  const next = nextInputWindow(afterFirst, session.state, 'draftSubmit')!
  expect(next.id).toBe(initial.id)
  expect(() => assertCommandInput('draftSubmit', { expectedVersion: 0, inputWindowId: initial.id }, 2, next)).not.toThrow()
  const reloaded = nextInputWindow(next, session.state, 'loadGame')!
  expect(reloaded.id).not.toBe(initial.id)
  expect(() => assertCommandInput('draftSubmit', { expectedVersion: 2, inputWindowId: initial.id }, 2, reloaded)).toThrow('input changed')
  session.dispose()
})

it('does not revive an old window on undo and still fences ordinary input by version', () => {
  const session = createOpeningSession({ seed: 42,
    options: { playerCount: 2, draftMode: 'simultaneous' },
    expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  const initial = nextInputWindow(null, session.state, 'initial')!
  const undone = nextInputWindow(initial, session.state, 'undoAction')!
  expect(undone.id).not.toBe(initial.id)
  expect(() => assertCommandInput('draftSubmit', { inputWindowId: initial.id }, 3, undone)).toThrow('input changed')
  expect(() => assertCommandInput('undoAction', { expectedVersion: 2 }, 3, undone)).toThrow('input changed')
  expect(() => assertCommandInput('undoAction', { expectedVersion: 3 }, 3, undone)).not.toThrow()
  session.dispose()
})

it('keeps parent choices in one window until the final submission resolves the phase', () => {
  const session = createOpeningSession({ seed: 42,
    options: { playerCount: 2, enableParentCards: true, parentSelectionSeed: 1 },
    expected: { phase: 'parent-selection', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  const initial = nextInputWindow(null, session.state, 'initial')!
  expect(initial.kind).toBe('parent')
  const candidates = session.state.parentSelection!.candidates
  const first = candidates[session.state.players[0]!.id]!
  const second = candidates[session.state.players[1]!.id]!
  expect(session.submitParentSelection(0, { mother: first.mother[0]!, father: first.father[0]! }).ok).toBe(true)
  const afterFirst = nextInputWindow(initial, session.state, 'parentSubmit')!
  expect(afterFirst.id).toBe(initial.id)
  expect(() => assertCommandInput('parentSubmit', { expectedVersion: 0, inputWindowId: initial.id }, 1, afterFirst)).not.toThrow()
  expect(session.submitParentSelection(1, { mother: second.mother[0]!, father: second.father[0]! }).ok).toBe(true)
  expect(nextInputWindow(afterFirst, session.state, 'parentSubmit')).toBeNull()
  expect(() => assertCommandInput('parentSubmit', { expectedVersion: 2, inputWindowId: initial.id }, 2, null)).toThrow('input changed')
  session.dispose()
})

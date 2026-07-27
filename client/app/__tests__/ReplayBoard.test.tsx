// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReplayBoard } from '../../../replay-viewer/src/ReplayBoard'
import { frameForPerspective } from '../../../replay-viewer/src/model'
import { EngineStack } from '../../../shared/engine'
import { serializeState } from '../../../shared/session/serialization'
import { createInitialState } from '../../../shared/session/state-bootstrap'

afterEach(cleanup)

describe('replay setup phases', () => {
  it('renders draft pools and submissions with perspective filtering', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const p1 = state.players[0]!.id
    const p2 = state.players[1]!.id
    state.phase = 'draft'
    state.draft = {
      mode: 'simultaneous',
      round: 1,
      totalRounds: 7,
      poolSize: 2,
      seatOrder: [p1, p2],
      pools: {
        [p1]: { occ: ['A001'], minor: ['A002'] },
        [p2]: { occ: ['B001'], minor: ['B002'] },
      },
      kept: {
        [p1]: { occ: ['A003'], minor: [] },
        [p2]: { occ: ['B003'], minor: [] },
      },
      pendingPicks: {
        [p1]: { occ: 'A001', minor: 'A002' },
        [p2]: { occ: 'B001', minor: 'B002' },
      },
    }
    const frame = serializeState(state, { engineStack: new EngineStack() })

    const view = render(
      <ReplayBoard frame={frameForPerspective(frame, 'p1')} locale="en" perspective="p1" />,
    )
    expect(screen.getByRole('region', { name: 'Card draft replay' })).toBeVisible()
    expect(screen.getAllByLabelText('A001').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('B001')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Hidden card').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Action board')).not.toBeInTheDocument()

    view.rerender(
      <ReplayBoard frame={frameForPerspective(frame, 'open')} locale="en" perspective="open" />,
    )
    expect(screen.getAllByLabelText('B001').length).toBeGreaterThan(0)
  })

  it('renders Parent Card candidates and recorded submissions', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const p1 = state.players[0]!.id
    const p2 = state.players[1]!.id
    state.phase = 'parent-selection'
    state.parentSelection = {
      candidates: {
        [p1]: { mother: ['PR01'], father: ['PS01'] },
        [p2]: { mother: ['PR02'], father: ['PS02'] },
      },
      submissions: {
        [p1]: { mother: 'PR01', father: 'PS01' },
        [p2]: { mother: 'PR02', father: 'PS02' },
      },
    }
    const frame = serializeState(state, { engineStack: new EngineStack() })

    const view = render(
      <ReplayBoard frame={frameForPerspective(frame, 'p1')} locale="en" perspective="p1" />,
    )
    expect(screen.getByRole('region', { name: 'Parent Card selection replay' })).toBeVisible()
    expect(screen.getAllByLabelText('PR01').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('PR02')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Hidden card').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Action board')).not.toBeInTheDocument()

    view.rerender(
      <ReplayBoard frame={frameForPerspective(frame, 'open')} locale="en" perspective="open" />,
    )
    expect(screen.getAllByLabelText('PR02').length).toBeGreaterThan(0)
  })
})

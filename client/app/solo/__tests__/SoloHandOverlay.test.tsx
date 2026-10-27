// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SoloHandOverlay } from '../SoloHandOverlay'
import type { SoloHandSelectionGroup } from '../../../../shared/contract/solo-hand-selection'

afterEach(cleanup)

const groups: SoloHandSelectionGroup[] = [
  { kind: 'occupation', cardIds: ['occ-1', 'occ-2', 'occ-3'], keepCount: 2 },
  { kind: 'minor', cardIds: ['minor-1', 'minor-2'], keepCount: 1 },
]

describe('solo starting hand selection', () => {
  it('collects every group, enforces its exact quota and submits once as one complete selection', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<SoloHandOverlay groups={groups} locale="en" onSubmit={onSubmit} />)
    const confirm = screen.getByRole('button', { name: 'Confirm starting hand' })
    expect(confirm).toBeDisabled()
    for (const name of ['occ-1', 'occ-2', 'occ-3', 'minor-1']) fireEvent.click(screen.getByRole('checkbox', { name }))
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'occ-3' }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ groups: [
      { kind: 'occupation', cardIds: ['occ-1', 'occ-2'] },
      { kind: 'minor', cardIds: ['minor-1'] },
    ] })
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
  })

  it('retains local selections through locale and repeated snapshots, and clears them on remount', () => {
    const onSubmit = vi.fn()
    const view = render(<SoloHandOverlay groups={groups} locale="en" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'occ-1' }))
    view.rerender(<SoloHandOverlay groups={groups.map(group => ({ ...group, cardIds: [...group.cardIds] }))} locale="zh" onSubmit={onSubmit} />)
    expect(screen.getByRole('checkbox', { name: 'occ-1' })).toBeChecked()
    expect(screen.getByRole('button', { name: '确认起始手牌' })).toBeDisabled()
    view.unmount()
    render(<SoloHandOverlay groups={groups} locale="zh" onSubmit={onSubmit} />)
    expect(screen.getByRole('checkbox', { name: 'occ-1' })).not.toBeChecked()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps failed picks editable and includes the separate Moor minor group in a retry', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Selection rejected')).mockResolvedValueOnce(undefined)
    render(<SoloHandOverlay groups={[...groups, { kind: 'moor-minor', cardIds: ['moor-1', 'moor-2'], keepCount: 1 }]} locale="en" onSubmit={onSubmit} />)
    for (const name of ['occ-1', 'occ-2', 'minor-1', 'moor-1']) fireEvent.click(screen.getByRole('checkbox', { name }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm starting hand' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm your hand')
    expect(screen.getByRole('checkbox', { name: 'moor-1' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'moor-1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'moor-2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm starting hand' }))
    expect(onSubmit).toHaveBeenLastCalledWith({ groups: [
      { kind: 'occupation', cardIds: ['occ-1', 'occ-2'] }, { kind: 'minor', cardIds: ['minor-1'] },
      { kind: 'moor-minor', cardIds: ['moor-2'] },
    ] })
  })
})

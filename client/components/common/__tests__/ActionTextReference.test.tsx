// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardDescriptionText } from '../CardDescriptionText'
import { ActionReferencePlayerCount } from '../../../contexts/ActionReferenceContext'

vi.mock('../../../services/action-references', () => ({
  loadActionReferences: async () => ({ version: 1, moorCards: [], spaces: [
    { id: 'fishing', players: [2], nameKey: 'actions.fishing.name', descriptionKey: 'actions.fishing.description' },
    { id: 'fishing', players: [4], nameKey: 'actions.fishing.name', descriptionKey: 'actions.fishing.description' },
  ] }),
}))

describe('card reference inspection', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true, value(this: HTMLElement) { this.style.display = 'block' },
    })
  })
  afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'showPopover') })
  it('exposes only the space reference as an inspectable control, without selecting its card', async () => {
    const select = vi.fn()
    render(<div onClick={select}><ActionReferencePlayerCount.Provider value={2}>
      <CardDescriptionText locale="en" text="__Major Improvement__ action and __space:fishing|Fishing__ action space" />
    </ActionReferencePlayerCount.Provider></div>)
    expect(screen.queryByRole('button', { name: 'Major Improvement' })).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Fishing' })
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Fishing' }).textContent).toContain('2'))
    expect(screen.getByRole('dialog').textContent).not.toContain('4')
    expect(select).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it('closes with Escape while retaining focus on the reference', async () => {
    render(<CardDescriptionText locale="en" text="__space:fishing|Fishing__" />)
    const trigger = screen.getByRole('button', { name: 'Fishing' })
    fireEvent.focus(trigger)
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it('reports an invalid authored target without exposing an unrelated action', async () => {
    render(<CardDescriptionText locale="en" text="__space:missing-space|Author draft__" />)
    fireEvent.click(screen.getByRole('button', { name: 'Author draft' }))
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent('Unknown action reference')
    expect(screen.queryByText('Gain food')).toBeNull()
  })
})

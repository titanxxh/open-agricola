// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerTabs, type PlayerSummary } from '../PlayerTabs'

const PLAYERS: PlayerSummary[] = [
  { id: 'p1', name: 'You', score: 12, isYou: true, isCurrent: true, color: '#aabbcc' },
  { id: 'p2', name: 'AI', score: 9, isYou: false, isCurrent: false, color: '#ccbbaa' },
]

afterEach(() => vi.unstubAllGlobals())

describe('PlayerTabs', () => {
  it.each([false, true])('removes floating-point tails in player scores (mobile: %s)', (mobile) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: mobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const { container } = render(<PlayerTabs players={[
      { ...PLAYERS[0]!, score: -15.899999999999999 },
      { ...PLAYERS[1]!, score: -0.75 },
    ]} active="p1" onChange={() => {}} />)
    expect(container.textContent).toContain('-15.9')
    expect(container.textContent).not.toContain('-15.899999999999999')
    if (!mobile) expect(container.textContent).toContain('-0.75')
  })
  it('renders one tab per player', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
  it('marks the active tab', () => {
    const { container } = render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(container.querySelector('[data-player="p1"][aria-selected="true"]')).toBeInTheDocument()
    expect(container.querySelector('[data-player="p2"][aria-selected="true"]')).not.toBeInTheDocument()
  })
  it('shows ☆ marker for "you"', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    const youTab = screen.getByRole('tab', { name: /you/i })
    expect(youTab.textContent).toContain('☆')
  })
  it('highlights the current-turn player', () => {
    const { container } = render(<PlayerTabs players={PLAYERS} active="p2" onChange={() => {}} />)
    expect(container.querySelector('[data-player="p1"].is-current-turn')).toBeInTheDocument()
  })
  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={fn} />)
    await user.click(screen.getByRole('tab', { name: /AI/i }))
    expect(fn).toHaveBeenCalledWith('p2')
  })
  it('shows score per tab', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})

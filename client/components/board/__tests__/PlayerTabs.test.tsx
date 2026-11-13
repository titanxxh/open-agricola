// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '../../../../shared/i18n'
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
    const { container } = render(<PlayerTabs locale="zh" players={[
      { ...PLAYERS[0]!, score: -15.899999999999999 },
      { ...PLAYERS[1]!, score: -0.75 },
    ]} active="p1" onChange={() => {}} />)
    expect(container.textContent).toContain('-15.9')
    expect(container.textContent).not.toContain('-15.899999999999999')
    if (!mobile) expect(container.textContent).toContain('-0.75')
  })
  it('renders one tab per player', () => {
    render(<PlayerTabs locale="zh" players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
  it('marks the active tab', () => {
    const { container } = render(<PlayerTabs locale="zh" players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(container.querySelector('[data-player="p1"][aria-selected="true"]')).toBeInTheDocument()
    expect(container.querySelector('[data-player="p2"][aria-selected="true"]')).not.toBeInTheDocument()
  })
  it('shows ☆ marker for "you"', () => {
    render(<PlayerTabs locale="zh" players={PLAYERS} active="p1" onChange={() => {}} />)
    const youTab = screen.getByRole('tab', { name: /you/i })
    expect(youTab.textContent).toContain('☆')
  })
  it('marks the current turn independently of the viewed tab', () => {
    render(<PlayerTabs locale="en" players={PLAYERS} active="p2" onChange={() => {}} />)
    const current = screen.getByRole('tab', { name: /You/ })
    const viewed = screen.getByRole('tab', { name: /AI/ })
    expect(current).toHaveClass('is-current-turn')
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(current).toHaveAttribute('aria-selected', 'false')
    expect(current.querySelector('.turn-marker')).toHaveAccessibleName(t('en', 'ui.currentPlayer'))
    expect(viewed).toHaveAttribute('aria-selected', 'true')
    expect(viewed).not.toHaveClass('is-current-turn')
    expect(viewed).not.toHaveAttribute('aria-current')
  })
  it('keeps the viewed-farm and current-turn cues when they belong to the same player', () => {
    render(<PlayerTabs locale="en" players={PLAYERS} active="p1" onChange={() => {}} />)
    const current = screen.getByRole('tab', { name: /You/ })
    expect(current).toHaveClass('is-active', 'is-current-turn')
    expect(current).toHaveAttribute('aria-selected', 'true')
    expect(current).toHaveAttribute('aria-current', 'true')
  })
  it('names the current player in the narrow player switcher', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const user = userEvent.setup()
    render(<PlayerTabs locale="en" players={PLAYERS} active="p2" onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('option', { name: /You/ })).toHaveTextContent(t('en', 'ui.currentPlayer'))
    expect(screen.getByRole('option', { name: /AI/ })).not.toHaveTextContent(t('en', 'ui.currentPlayer'))
  })
  it('activates a player tab from the keyboard', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PlayerTabs locale="en" players={PLAYERS} active="p2" onChange={onChange} />)
    const current = screen.getByRole('tab', { name: /You/ })
    current.focus()
    expect(current).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('p1')
  })
  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<PlayerTabs locale="zh" players={PLAYERS} active="p1" onChange={fn} />)
    await user.click(screen.getByRole('tab', { name: /AI/i }))
    expect(fn).toHaveBeenCalledWith('p2')
  })
  it('shows score per tab', () => {
    render(<PlayerTabs locale="zh" players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { MobileTabBar } from '../MobileTabBar'

describe('MobileTabBar', () => {
  it('keeps tab icons visible without emoji glyphs', () => {
    const { container } = render(
      <MobileTabBar current="lobby" onNavigate={() => {}} />,
    )
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(container.querySelectorAll('.mobile-tab-bar__icon svg')).toHaveLength(3)
  })

  it('localizes high-frequency navigation names', () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    render(
      <LocaleProvider>
        <MobileTabBar current="lobby" onNavigate={() => {}} />
      </LocaleProvider>,
    )
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lobby' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workshop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('marks the current tab as active', () => {
    const { container } = render(
      <MobileTabBar current="lobby" onNavigate={() => {}} />,
    )
    expect(container.querySelector('[data-tab="lobby"].is-active')).toBeInTheDocument()
    expect(container.querySelector('[data-tab="workshop"].is-active')).not.toBeInTheDocument()
  })
  it('calls onNavigate when a tab is clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<MobileTabBar current="lobby" onNavigate={fn} />)
    await user.click(screen.getByRole('button', { name: /workshop|工坊/i }))
    expect(fn).toHaveBeenCalledWith('workshop')
  })
})

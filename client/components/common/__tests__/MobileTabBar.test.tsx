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
    expect(container.querySelectorAll('.mobile-tab-bar__icon svg')).toHaveLength(4)
  })

  it('localizes high-frequency navigation names', () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    render(
      <LocaleProvider>
        <MobileTabBar current="lobby" onNavigate={() => {}} />
      </LocaleProvider>,
    )
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Lobby', 'Workshop', 'Cards', 'Settings'])
  })

  it('marks the current tab as active', () => {
    const { container } = render(
      <MobileTabBar current="lobby" onNavigate={() => {}} />,
    )
    expect(container.querySelector('[data-tab="lobby"].is-active')).toBeInTheDocument()
    expect(container.querySelector('[data-tab="workshop"].is-active')).not.toBeInTheDocument()
  })

  it('opens the encyclopedia from its tab and marks it as the current page there', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    const user = userEvent.setup()
    const fn = vi.fn()
    const { rerender } = render(<LocaleProvider><MobileTabBar current="lobby" onNavigate={fn} /></LocaleProvider>)

    await user.click(screen.getByRole('button', { name: 'Cards' }))
    expect(fn).toHaveBeenCalledWith('encyclopedia')

    rerender(<LocaleProvider><MobileTabBar current="encyclopedia" onNavigate={fn} /></LocaleProvider>)
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Lobby' })).not.toHaveAttribute('aria-current')
  })

  it('calls onNavigate when a tab is clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<MobileTabBar current="lobby" onNavigate={fn} />)
    await user.click(screen.getByRole('button', { name: /workshop|工坊/i }))
    expect(fn).toHaveBeenCalledWith('workshop')
  })
})
